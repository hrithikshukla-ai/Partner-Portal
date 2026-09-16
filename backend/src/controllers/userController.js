const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { ROLES } = require('../utils/roles');
const { sendMail } = require('../utils/mailer');

const MANAGE_ANY_USER = [ROLES.SUPER_ADMIN, ROLES.GLOBAL_PARTNER_MANAGER];

function canManageTarget(actor, target) {
  if (MANAGE_ANY_USER.includes(actor.roleCode)) return true;
  if (actor.roleCode === ROLES.REGIONAL_PARTNER_MANAGER) {
    return target.region_id === actor.regionId || target.partner_region_id === actor.regionId;
  }
  if (actor.roleCode === ROLES.PARTNER_ADMIN) {
    return target.partner_id === actor.partnerId;
  }
  return false;
}

function activationEmail(user, token) {
  const link = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/activate?token=${token}`;
  return {
    subject: 'Your Academia Partner Portal account',
    html: `<p>Hi ${user.firstName},</p>
<p>An account has been created for you on the Academia Partner Portal.</p>
<p><a href="${link}">Click here to activate your account and set a password</a>.</p>
<p>This link expires in 7 days.</p>`,
  };
}

// GET /api/users -- scoped list with optional ?q= search across name/email
async function listUsers(req, res) {
  const actor = req.user;
  const q = (req.query.q || '').trim();
  let where = '1=1';
  const params = [];

  if (actor.roleCode === ROLES.REGIONAL_PARTNER_MANAGER) {
    where += ' AND (u.region_id = ? OR p.region_id = ?)';
    params.push(actor.regionId, actor.regionId);
  } else if (actor.roleCode === ROLES.PARTNER_ADMIN) {
    where += ' AND u.partner_id = ?';
    params.push(actor.partnerId);
  } else if (!MANAGE_ANY_USER.includes(actor.roleCode)) {
    return res.status(403).json({ error: 'Not authorised to view the user directory' });
  }

  if (q) {
    where += ' AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const [rows] = await pool.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.designation, u.phone_dialing_code, u.phone,
            u.status, u.last_login_at, r.code AS role_code, u.region_id, reg.name AS region_name,
            u.partner_id, p.company_name AS partner_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN regions reg ON reg.id = u.region_id
     LEFT JOIN partners p ON p.id = u.partner_id
     WHERE ${where}
     ORDER BY u.created_at DESC`,
    params
  );
  res.json(rows);
}

// GET /api/users/:id
async function getUser(req, res) {
  const [[user]] = await pool.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.designation, u.phone_dialing_code, u.phone,
            u.status, r.code AS role_code, u.region_id, u.partner_id, p.region_id AS partner_region_id
     FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN partners p ON p.id = u.partner_id
     WHERE u.id = ?`,
    [req.params.id]
  );
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!canManageTarget(req.user, user) && req.user.id !== user.id) {
    return res.status(403).json({ error: 'Not authorised to view this user' });
  }
  delete user.partner_region_id;
  res.json(user);
}

// POST /api/users -- create a user in the directory (Master > Users)
async function createUser(req, res) {
  const actor = req.user;
  const { email, firstName, lastName, designation, phoneDialingCode, phone, roleCode, regionId, partnerId } = req.body;
  if (!email || !firstName || !lastName || !roleCode) {
    return res.status(400).json({ error: 'email, firstName, lastName and roleCode are required' });
  }

  if (!MANAGE_ANY_USER.includes(actor.roleCode)) {
    if (actor.roleCode === ROLES.REGIONAL_PARTNER_MANAGER) {
      const regionScoped = [ROLES.REGIONAL_PARTNER_MANAGER, ROLES.ACADEMIA_MARKETING, ROLES.ACADEMIA_SALES, ROLES.PARTNER_ADMIN, ROLES.PARTNER_SALES_USER];
      if (!regionScoped.includes(roleCode)) return res.status(403).json({ error: 'Not authorised to create this role' });
    } else if (actor.roleCode === ROLES.PARTNER_ADMIN) {
      if (roleCode !== ROLES.PARTNER_SALES_USER) return res.status(403).json({ error: 'Partner Admins can only create Partner Sales Users' });
    } else {
      return res.status(403).json({ error: 'Not authorised to create users' });
    }
  }

  const [[roleRow]] = await pool.query('SELECT id FROM roles WHERE code = ?', [roleCode]);
  if (!roleRow) return res.status(400).json({ error: 'Unknown roleCode' });

  const effectiveRegionId = actor.roleCode === ROLES.REGIONAL_PARTNER_MANAGER ? actor.regionId : (regionId || null);
  const effectivePartnerId = actor.roleCode === ROLES.PARTNER_ADMIN ? actor.partnerId : (partnerId || null);

  const tempPassword = crypto.randomBytes(24).toString('hex');
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const activationToken = crypto.randomBytes(32).toString('base64url');
  const activationExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  try {
    const [result] = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, designation, phone_dialing_code, phone,
                          role_id, region_id, partner_id, status, activation_token, activation_token_expires)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'invited', ?, ?)`,
      [email, passwordHash, firstName, lastName, designation || null, phoneDialingCode || null, phone || null,
       roleRow.id, effectiveRegionId, effectivePartnerId, activationToken, activationExpires]
    );

    await pool.query(
      `INSERT INTO access_audit_log (user_id, action, entity_type, entity_id) VALUES (?, 'USER_CREATED', 'user', ?)`,
      [actor.id, result.insertId]
    );

    const mail = activationEmail({ firstName }, activationToken);
    await sendMail({ to: email, ...mail });

    res.status(201).json({ userId: result.insertId, email, status: 'invited' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A user with this email already exists' });
    throw err;
  }
}

// PATCH /api/users/:id -- edit profile (name, designation, email, phone)
async function updateUser(req, res) {
  const targetId = Number(req.params.id);
  const isSelf = req.user.id === targetId;
  const { firstName, lastName, designation, phoneDialingCode, phone, email } = req.body;

  if (!isSelf) {
    const [[target]] = await pool.query(
      `SELECT u.id, u.region_id, u.partner_id, p.region_id AS partner_region_id FROM users u LEFT JOIN partners p ON p.id = u.partner_id WHERE u.id = ?`,
      [targetId]
    );
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!canManageTarget(req.user, target)) return res.status(403).json({ error: 'Not authorised to edit this user' });
  }

  try {
    await pool.query(
      `UPDATE users SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name),
              designation = COALESCE(?, designation), phone_dialing_code = COALESCE(?, phone_dialing_code),
              phone = COALESCE(?, phone), email = COALESCE(?, email)
       WHERE id = ?`,
      [firstName, lastName, designation, phoneDialingCode, phone, email, targetId]
    );
    res.json({ id: targetId, updated: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A user with this email already exists' });
    throw err;
  }
}

// PATCH /api/users/:id/status -- active | disabled
async function setStatus(req, res) {
  const { status } = req.body;
  if (!['active', 'disabled'].includes(status)) return res.status(400).json({ error: "status must be 'active' or 'disabled'" });

  const [[target]] = await pool.query(
    `SELECT u.id, u.region_id, u.partner_id, p.region_id AS partner_region_id FROM users u LEFT JOIN partners p ON p.id = u.partner_id WHERE u.id = ?`,
    [req.params.id]
  );
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (!canManageTarget(req.user, target)) return res.status(403).json({ error: 'Not authorised to change this user\'s status' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot disable your own account' });

  await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, target.id]);
  res.json({ id: target.id, status });
}

// PATCH /api/users/:id/password -- admin sets a new password directly ("edit password").
// Passwords are stored as one-way bcrypt hashes, so an existing password can never be *viewed* —
// only replaced. This is standard practice; "view password" is not something any well-built app offers.
async function adminSetPassword(req, res) {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'newPassword must be at least 8 characters' });

  const [[target]] = await pool.query(
    `SELECT u.id, u.region_id, u.partner_id, p.region_id AS partner_region_id FROM users u LEFT JOIN partners p ON p.id = u.partner_id WHERE u.id = ?`,
    [req.params.id]
  );
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (!canManageTarget(req.user, target)) return res.status(403).json({ error: 'Not authorised to reset this user\'s password' });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, target.id]);
  await pool.query(
    `INSERT INTO access_audit_log (user_id, action, entity_type, entity_id) VALUES (?, 'PASSWORD_RESET_BY_ADMIN', 'user', ?)`,
    [req.user.id, target.id]
  );
  res.json({ id: target.id, passwordChanged: true });
}

// PATCH /api/users/me/password -- self-service change password
async function changeOwnPassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'newPassword must be at least 8 characters' });

  const [[row]] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  const valid = await bcrypt.compare(currentPassword, row.password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.user.id]);
  res.json({ changed: true });
}

// DELETE /api/users/:id -- hard delete when nothing references this user; otherwise ask to disable instead.
async function deleteUser(req, res) {
  const [[target]] = await pool.query(
    `SELECT u.id, u.region_id, u.partner_id, p.region_id AS partner_region_id FROM users u LEFT JOIN partners p ON p.id = u.partner_id WHERE u.id = ?`,
    [req.params.id]
  );
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (!canManageTarget(req.user, target)) return res.status(403).json({ error: 'Not authorised to delete this user' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });

  try {
    await pool.query('DELETE FROM users WHERE id = ?', [target.id]);
    res.json({ id: target.id, deleted: true });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(409).json({ error: 'This user has activity on record (deals, approvals, history) and cannot be deleted — disable the account instead.' });
    }
    throw err;
  }
}

// POST /api/users/activate -- consumes the emailed token, sets the chosen password, activates the account
async function activate(req, res) {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'token and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });

  const [[user]] = await pool.query(
    'SELECT id, activation_token_expires FROM users WHERE activation_token = ?',
    [token]
  );
  if (!user || new Date(user.activation_token_expires) < new Date()) {
    return res.status(400).json({ error: 'This activation link is invalid or has expired' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    `UPDATE users SET password_hash = ?, status = 'active', activation_token = NULL, activation_token_expires = NULL WHERE id = ?`,
    [passwordHash, user.id]
  );
  res.json({ activated: true });
}

module.exports = { listUsers, getUser, createUser, updateUser, setStatus, adminSetPassword, changeOwnPassword, deleteUser, activate };
