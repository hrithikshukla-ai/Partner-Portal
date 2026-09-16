const pool = require('../config/db');
const { ROLES } = require('../utils/roles');

// POST /api/incentives/mdf -- partner requests co-marketing funds
async function requestMdf(req, res) {
  const { activityDescription, requestedAmountUsd } = req.body;
  if (!activityDescription || !requestedAmountUsd) {
    return res.status(400).json({ error: 'activityDescription and requestedAmountUsd are required' });
  }
  const [result] = await pool.query(
    'INSERT INTO mdf_requests (partner_id, requested_by, activity_description, requested_amount_usd) VALUES (?, ?, ?, ?)',
    [req.user.partnerId, req.user.id, activityDescription, requestedAmountUsd]
  );
  res.status(201).json({ id: result.insertId, status: 'submitted' });
}

// PATCH /api/incentives/mdf/:id/decision -- Regional/Global Partner Manager approves/rejects
async function decideMdf(req, res) {
  const { decision, approvedAmountUsd } = req.body; // 'approved' | 'rejected'
  if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: "decision must be 'approved' or 'rejected'" });

  await pool.query(
    'UPDATE mdf_requests SET status = ?, approved_amount_usd = ?, approved_by = ? WHERE id = ?',
    [decision, decision === 'approved' ? approvedAmountUsd || null : null, req.user.id, req.params.id]
  );
  res.json({ id: Number(req.params.id), status: decision });
}

// GET /api/incentives/mdf -- scoped list
async function listMdf(req, res) {
  const user = req.user;
  let where = '1=1';
  const params = [];
  if ([ROLES.PARTNER_ADMIN, ROLES.PARTNER_SALES_USER].includes(user.roleCode)) {
    where = 'm.partner_id = ?';
    params.push(user.partnerId);
  } else if (user.roleCode === ROLES.REGIONAL_PARTNER_MANAGER) {
    where = 'p.region_id = ?';
    params.push(user.regionId);
  }
  const [rows] = await pool.query(
    `SELECT m.id, m.partner_id, p.company_name, m.activity_description, m.requested_amount_usd,
            m.approved_amount_usd, m.status, m.created_at
     FROM mdf_requests m JOIN partners p ON p.id = m.partner_id WHERE ${where} ORDER BY m.created_at DESC`,
    params
  );
  res.json(rows);
}

// GET /api/incentives/commissions -- visibility only; actual payout depends on ERP/finance readiness (BRD 8.10)
async function listCommissions(req, res) {
  const user = req.user;
  let where = '1=1';
  const params = [];
  if ([ROLES.PARTNER_ADMIN, ROLES.PARTNER_SALES_USER].includes(user.roleCode)) {
    where = 'c.partner_id = ?';
    params.push(user.partnerId);
  }
  const [rows] = await pool.query(
    `SELECT c.id, c.deal_id, c.partner_id, p.company_name, c.commission_pct, c.commission_amount_usd, c.payout_status, c.created_at
     FROM commission_records c JOIN partners p ON p.id = c.partner_id WHERE ${where} ORDER BY c.created_at DESC`,
    params
  );
  res.json(rows);
}

module.exports = { requestMdf, decideMdf, listMdf, listCommissions };
