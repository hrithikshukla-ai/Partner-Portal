const pool = require('../config/db');

// GET /api/notifications -- current user's own notifications only
async function myNotifications(req, res) {
  const [rows] = await pool.query(
    'SELECT id, type, channel, title, body, is_read, sent_at FROM notifications WHERE user_id = ? ORDER BY sent_at DESC LIMIT 100',
    [req.user.id]
  );
  res.json(rows);
}

// PATCH /api/notifications/:id/read
async function markRead(req, res) {
  await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json({ id: Number(req.params.id), isRead: true });
}

// Internal helper used by other controllers/services to raise a notification.
async function notify({ userId, type, channel = 'in_app', title, body, entityType, entityId }) {
  await pool.query(
    `INSERT INTO notifications (user_id, type, channel, title, body, entity_type, entity_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, type, channel, title, body, entityType || null, entityId || null]
  );
}

// POST /api/notifications/broadcast -- targetMode: 'all' | 'region' | 'partner' | 'user'
async function broadcast(req, res) {
  const { title, body, targetMode, targetRegionId, targetPartnerId, targetUserId, targetTierId } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'title and body are required' });
  const mode = targetMode || (targetUserId ? 'user' : targetPartnerId ? 'partner' : targetRegionId ? 'region' : 'all');

  const [result] = await pool.query(
    `INSERT INTO broadcast_announcements (title, body, target_mode, target_region_id, target_partner_id, target_user_id, target_tier_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, body, mode, targetRegionId || null, targetPartnerId || null, targetUserId || null, targetTierId || null, req.user.id]
  );

  let recipients;
  if (mode === 'user') {
    recipients = targetUserId ? [{ id: targetUserId }] : [];
  } else if (mode === 'partner') {
    const [rows] = await pool.query(
      `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code IN ('PARTNER_ADMIN','PARTNER_SALES_USER') AND u.partner_id = ?`,
      [targetPartnerId]
    );
    recipients = rows;
  } else {
    let where = "r.code IN ('PARTNER_ADMIN','PARTNER_SALES_USER')";
    const params = [];
    if (mode === 'region') { where += ' AND p.region_id = ?'; params.push(targetRegionId); }
    if (targetTierId) { where += ' AND p.tier_id = ?'; params.push(targetTierId); }
    const [rows] = await pool.query(
      `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id JOIN partners p ON p.id = u.partner_id WHERE ${where}`,
      params
    );
    recipients = rows;
  }

  for (const r of recipients) {
    await notify({ userId: r.id, type: 'broadcast', title, body, entityType: 'broadcast_announcement', entityId: result.insertId });
  }

  res.status(201).json({ id: result.insertId, recipientCount: recipients.length });
}

module.exports = { myNotifications, markRead, notify, broadcast };
