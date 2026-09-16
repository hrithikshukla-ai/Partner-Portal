const pool = require('../config/db');
const { ROLES } = require('../utils/roles');
const { buildScopeClause } = require('../middleware/scope');

const DEFAULT_PROTECTION_DAYS = 90;

/**
 * Conflict check: an institute is "protected" if it already has a deal that is
 *  - approval_status = 'approved'
 *  - win_loss = 'open'
 *  - protected_until >= today
 * registered by a DIFFERENT partner. This is what stops two partners (or a
 * partner + Academia direct sales) from working the same institute at once.
 */
async function findActiveConflict(conn, instituteId, excludingPartnerId) {
  const [rows] = await conn.query(
    `SELECT id, partner_id, protected_until FROM deals
     WHERE institute_id = ?
       AND approval_status = 'approved'
       AND win_loss = 'open'
       AND protected_until >= CURDATE()
       AND partner_id != ?
     LIMIT 1`,
    [instituteId, excludingPartnerId]
  );
  return rows[0] || null;
}

// POST /api/deals -- Partner Sales User / Partner Admin registers a deal
async function registerDeal(req, res) {
  const user = req.user;
  if (![ROLES.PARTNER_SALES_USER, ROLES.PARTNER_ADMIN].includes(user.roleCode)) {
    return res.status(403).json({ error: 'Only partner users can register a deal' });
  }

  const { instituteId, dealValueUsd, nextStep, nextStepDueDate } = req.body;
  if (!instituteId) return res.status(400).json({ error: 'instituteId is required' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[institute]] = await conn.query('SELECT id, region_id, country_id FROM institutes WHERE id = ?', [instituteId]);
    if (!institute) {
      await conn.rollback();
      return res.status(404).json({ error: 'Institute not found' });
    }

    const [firstStage] = await conn.query('SELECT id FROM pipeline_stages ORDER BY sort_order ASC LIMIT 1');
    const stageId = firstStage[0].id;

    const [result] = await conn.query(
      `INSERT INTO deals (institute_id, partner_id, registered_by, stage_id, deal_value_usd,
                          next_step, next_step_due_date, protection_window_days, approval_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [instituteId, user.partnerId, user.id, stageId, dealValueUsd || null, nextStep || null,
       nextStepDueDate || null, DEFAULT_PROTECTION_DAYS]
    );
    const dealId = result.insertId;

    // Conflict check runs immediately at registration time so both the
    // submitting partner and Academia see the result right away.
    const conflict = await findActiveConflict(conn, instituteId, user.partnerId);
    await conn.query(
      `INSERT INTO deal_conflict_checks (institute_id, requesting_deal_id, conflicting_deal_id, result)
       VALUES (?, ?, ?, ?)`,
      [instituteId, dealId, conflict ? conflict.id : null, conflict ? 'conflict' : 'clear']
    );

    await conn.query(
      `INSERT INTO deal_stage_history (deal_id, from_stage_id, to_stage_id, changed_by) VALUES (?, NULL, ?, ?)`,
      [dealId, stageId, user.id]
    );

    await conn.commit();

    res.status(201).json({
      dealId,
      approvalStatus: 'pending',
      conflict: conflict
        ? { status: 'conflict', message: 'This institute already has an active protected deal with another partner.' }
        : { status: 'clear' },
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// PATCH /api/deals/:id/approve -- Regional/Global Partner Manager
async function approveDeal(req, res) {
  const { decision } = req.body; // 'approved' | 'rejected'
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'approved' or 'rejected'" });
  }

  const dealId = req.params.id;
  const [[deal]] = await pool.query(
    `SELECT d.id, d.institute_id, d.partner_id, d.protection_window_days, i.region_id
     FROM deals d JOIN institutes i ON i.id = d.institute_id WHERE d.id = ?`,
    [dealId]
  );
  if (!deal) return res.status(404).json({ error: 'Deal not found' });

  if (req.user.roleCode === ROLES.REGIONAL_PARTNER_MANAGER && deal.region_id !== req.user.regionId) {
    return res.status(403).json({ error: 'Deal is outside your region' });
  }

  if (decision === 'approved') {
    // Re-check for conflicts at approval time too (state may have changed since registration).
    const conflict = await findActiveConflict(pool, deal.institute_id, deal.partner_id);
    if (conflict) {
      return res.status(409).json({
        error: 'Cannot approve: institute is currently protected under another partner\'s active deal.',
        conflictingDealId: conflict.id,
      });
    }
    await pool.query(
      `UPDATE deals SET approval_status='approved', approved_by=?, approved_at=NOW(),
              protected_until = DATE_ADD(CURDATE(), INTERVAL protection_window_days DAY)
       WHERE id = ?`,
      [req.user.id, dealId]
    );
  } else {
    await pool.query(`UPDATE deals SET approval_status='rejected', approved_by=?, approved_at=NOW() WHERE id = ?`, [req.user.id, dealId]);
  }

  await pool.query(
    `INSERT INTO access_audit_log (user_id, action, entity_type, entity_id, metadata_json)
     VALUES (?, 'DEAL_APPROVAL', 'deal', ?, JSON_OBJECT('decision', ?))`,
    [req.user.id, dealId, decision]
  );

  res.json({ dealId: Number(dealId), approvalStatus: decision });
}

// PATCH /api/deals/:id/stage -- move a deal through the pipeline
async function updateStage(req, res) {
  const { stageId, nextStep, nextStepDueDate, currentStatusNote } = req.body;
  const dealId = req.params.id;

  const [[deal]] = await pool.query('SELECT id, stage_id, partner_id FROM deals WHERE id = ?', [dealId]);
  if (!deal) return res.status(404).json({ error: 'Deal not found' });

  if ([ROLES.PARTNER_SALES_USER, ROLES.PARTNER_ADMIN].includes(req.user.roleCode) && deal.partner_id !== req.user.partnerId) {
    return res.status(403).json({ error: 'Cannot update another partner\'s deal' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (stageId && stageId !== deal.stage_id) {
      await conn.query('UPDATE deals SET stage_id = ?, stage_entered_at = NOW() WHERE id = ?', [stageId, dealId]);
      await conn.query(
        'INSERT INTO deal_stage_history (deal_id, from_stage_id, to_stage_id, changed_by) VALUES (?, ?, ?, ?)',
        [dealId, deal.stage_id, stageId, req.user.id]
      );
    }
    if (nextStep !== undefined || nextStepDueDate !== undefined || currentStatusNote !== undefined) {
      await conn.query(
        `UPDATE deals SET next_step = COALESCE(?, next_step),
                next_step_due_date = COALESCE(?, next_step_due_date),
                current_status_note = COALESCE(?, current_status_note)
         WHERE id = ?`,
        [nextStep, nextStepDueDate, currentStatusNote, dealId]
      );
    }
    await conn.commit();
    res.json({ dealId: Number(dealId), updated: true });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// PATCH /api/deals/:id/close -- won / lost with reason code
async function closeDeal(req, res) {
  const { outcome, reasonCode } = req.body; // 'won' | 'lost'
  if (!['won', 'lost'].includes(outcome)) return res.status(400).json({ error: "outcome must be 'won' or 'lost'" });

  const dealId = req.params.id;
  const [[deal]] = await pool.query('SELECT id, partner_id FROM deals WHERE id = ?', [dealId]);
  if (!deal) return res.status(404).json({ error: 'Deal not found' });

  if ([ROLES.PARTNER_SALES_USER, ROLES.PARTNER_ADMIN].includes(req.user.roleCode) && deal.partner_id !== req.user.partnerId) {
    return res.status(403).json({ error: 'Cannot close another partner\'s deal' });
  }

  const wonStageQuery = await pool.query("SELECT id FROM pipeline_stages WHERE name = ?", [outcome === 'won' ? 'Won' : 'Lost']);
  const closingStageId = wonStageQuery[0][0].id;

  await pool.query(
    `UPDATE deals SET win_loss = ?, win_loss_reason_code = ?, stage_id = ?, stage_entered_at = NOW() WHERE id = ?`,
    [outcome, reasonCode || null, closingStageId, dealId]
  );

  res.json({ dealId: Number(dealId), outcome });
}

// GET /api/deals -- scoped list with aging/SLA flag, optional partnerId/regionId/stageId filters
async function listDeals(req, res) {
  const user = req.user;
  const { partnerId, regionId, stageId } = req.query;
  let where = '1=1';
  const params = [];

  if ([ROLES.PARTNER_ADMIN, ROLES.PARTNER_SALES_USER].includes(user.roleCode)) {
    where += ' AND d.partner_id = ?';
    params.push(user.partnerId);
    if (user.roleCode === ROLES.PARTNER_SALES_USER) {
      where += ' AND d.registered_by = ?';
      params.push(user.id);
    }
  } else if (user.roleCode === ROLES.REGIONAL_PARTNER_MANAGER) {
    where += ' AND i.region_id = ?';
    params.push(user.regionId);
  } else if (user.roleCode === ROLES.ACADEMIA_SALES) {
    where += ' AND d.academia_account_manager_id = ?';
    params.push(user.id);
  }
  // SUPER_ADMIN / GLOBAL_PARTNER_MANAGER: no filter (full visibility)

  if (partnerId) { where += ' AND d.partner_id = ?'; params.push(partnerId); }
  if (regionId) { where += ' AND i.region_id = ?'; params.push(regionId); }
  if (stageId) { where += ' AND d.stage_id = ?'; params.push(stageId); }

  const [rows] = await pool.query(
    `SELECT d.id, d.institute_id, ins.name AS institute_name, d.partner_id, p.company_name AS partner_name,
            d.stage_id, st.name AS stage_name, st.sla_days, d.deal_value_usd, d.next_step, d.next_step_due_date,
            d.approval_status, d.win_loss, d.protected_until, d.stage_entered_at,
            DATEDIFF(CURDATE(), d.stage_entered_at) AS days_in_stage,
            CASE WHEN st.sla_days IS NOT NULL AND DATEDIFF(CURDATE(), d.stage_entered_at) > st.sla_days
                 THEN TRUE ELSE FALSE END AS sla_breached
     FROM deals d
     JOIN institutes ins ON ins.id = d.institute_id
     JOIN partners p ON p.id = d.partner_id
     JOIN pipeline_stages st ON st.id = d.stage_id
     WHERE ${where}
     ORDER BY d.updated_at DESC`,
    params
  );
  res.json(rows);
}

module.exports = { registerDeal, approveDeal, updateStage, closeDeal, listDeals };
