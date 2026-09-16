const pool = require('../config/db');
const { ROLES } = require('../utils/roles');

// POST /api/cadence/meetings
async function scheduleMeeting(req, res) {
  const { partnerId, regionId, scheduledAt, frequency } = req.body;
  if (!scheduledAt) return res.status(400).json({ error: 'scheduledAt is required' });
  const [result] = await pool.query(
    'INSERT INTO cadence_meetings (partner_id, region_id, scheduled_at, frequency, organized_by) VALUES (?, ?, ?, ?, ?)',
    [partnerId || null, regionId || null, scheduledAt, frequency || 'fortnightly', req.user.id]
  );
  res.status(201).json({ id: result.insertId });
}

// GET /api/cadence/meetings -- scoped, with optional partnerId / regionId / countryId / status filters.
// Each meeting's partner timezone is included so the client can render the schedule in the
// partner's local time (BRD ask: partner login should see cadence times in their own timezone).
async function listMeetings(req, res) {
  const user = req.user;
  const { partnerId, regionId, countryId, status } = req.query;
  let where = '1=1';
  const params = [];
  let join = 'LEFT JOIN partners p ON p.id = m.partner_id';

  if ([ROLES.PARTNER_ADMIN, ROLES.PARTNER_SALES_USER].includes(user.roleCode)) {
    where += ' AND m.partner_id = ?';
    params.push(user.partnerId);
  } else if (user.roleCode === ROLES.REGIONAL_PARTNER_MANAGER) {
    where += ' AND (m.region_id = ? OR p.region_id = ?)';
    params.push(user.regionId, user.regionId);
  }

  if (partnerId) { where += ' AND m.partner_id = ?'; params.push(partnerId); }
  if (regionId) { where += ' AND (m.region_id = ? OR p.region_id = ?)'; params.push(regionId, regionId); }
  if (countryId) {
    join += ' LEFT JOIN partner_countries pc ON pc.partner_id = p.id';
    where += ' AND pc.country_id = ?';
    params.push(countryId);
  }
  if (status) {
    where += ' AND EXISTS (SELECT 1 FROM mom_action_items mi WHERE mi.meeting_id = m.id AND mi.status = ?)';
    params.push(status);
  }

  const [rows] = await pool.query(
    `SELECT DISTINCT m.id, m.scheduled_at, m.frequency, m.partner_id, p.company_name, p.timezone AS partner_timezone, m.region_id
     FROM cadence_meetings m ${join}
     WHERE ${where} ORDER BY m.scheduled_at DESC`,
    params
  );
  res.json(rows);
}

// GET /api/cadence/meetings/:id/action-items
async function listActionItems(req, res) {
  const [rows] = await pool.query(
    `SELECT mi.id, mi.action_item, mi.owner_id, mi.owner_text, mi.status, mi.promised_date, mi.completion_date, mi.remarks,
            u.first_name, u.last_name
     FROM mom_action_items mi LEFT JOIN users u ON u.id = mi.owner_id
     WHERE mi.meeting_id = ? ORDER BY mi.created_at`,
    [req.params.id]
  );
  res.json(rows);
}

// POST /api/cadence/meetings/:id/action-items
async function addActionItem(req, res) {
  const { actionItem, ownerId, ownerText, promisedDate, remarks, linkedDealId, linkedInstituteId } = req.body;
  if (!actionItem) return res.status(400).json({ error: 'actionItem is required' });
  const [result] = await pool.query(
    `INSERT INTO mom_action_items (meeting_id, linked_deal_id, linked_institute_id, action_item, owner_id, owner_text, promised_date, remarks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.params.id, linkedDealId || null, linkedInstituteId || null, actionItem, ownerId || null, ownerText || null, promisedDate || null, remarks || null]
  );
  res.status(201).json({ id: result.insertId, status: 'pending' });
}

// PATCH /api/cadence/action-items/:id -- update status / completion date / remarks
async function updateActionItem(req, res) {
  const { status, completionDate, remarks, promisedDate } = req.body;
  if (status && !['pending', 'done'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' });
  }
  await pool.query(
    `UPDATE mom_action_items SET status = COALESCE(?, status),
            completion_date = COALESCE(?, completion_date),
            remarks = COALESCE(?, remarks), promised_date = COALESCE(?, promised_date)
     WHERE id = ?`,
    [status || null, completionDate || null, remarks ?? null, promisedDate || null, req.params.id]
  );
  res.json({ id: Number(req.params.id), updated: true });
}

// GET /api/cadence/partners/:partnerId/history -- for QBRs
async function partnerCadenceHistory(req, res) {
  const [rows] = await pool.query(
    `SELECT mi.id, mi.action_item, mi.status, mi.promised_date, mi.completion_date, mi.remarks,
            m.scheduled_at, mi.owner_text, u.first_name, u.last_name
     FROM mom_action_items mi
     JOIN cadence_meetings m ON m.id = mi.meeting_id
     LEFT JOIN users u ON u.id = mi.owner_id
     WHERE m.partner_id = ?
     ORDER BY m.scheduled_at DESC`,
    [req.params.partnerId]
  );
  res.json(rows);
}

module.exports = { scheduleMeeting, listMeetings, listActionItems, addActionItem, updateActionItem, partnerCadenceHistory };
