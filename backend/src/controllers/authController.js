const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

function issueSession(user) {
  const payload = {
    id: user.id,
    email: user.email,
    roleCode: user.role_code,
    regionId: user.region_id,
    partnerId: user.partner_id,
  };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
  return { token, payload };
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const [rows] = await pool.query(
    `SELECT u.id, u.email, u.password_hash, u.status, u.region_id, u.partner_id,
            r.code AS role_code
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.email = ?`,
    [email]
  );

  const user = rows[0];
  if (!user || !user.password_hash) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.status !== 'active') return res.status(403).json({ error: 'Account is not active' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const { token, payload } = issueSession(user);

  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  await pool.query(
    `INSERT INTO access_audit_log (user_id, action, entity_type, entity_id) VALUES (?, 'LOGIN', 'user', ?)`,
    [user.id, user.id]
  );

  res.json({ token, user: payload });
}

async function me(req, res) {
  const [rows] = await pool.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.designation, u.phone_dialing_code, u.phone, u.status,
            r.code AS role_code, u.region_id, u.partner_id
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    [req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
}

// GET /api/auth/sso/status -- lets the login page know whether to render the SSO button
function ssoStatus(req, res) {
  res.json({ googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) });
}

// GET /api/auth/sso/google/login -- redirects to Google's consent screen
function googleLogin(req, res) {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(501).json({ error: 'Google SSO is not configured on this server' });

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

// GET /api/auth/sso/google/callback -- exchanges the code, finds/links the user, then hands off to the SPA
async function googleCallback(req, res) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(501).json({ error: 'Google SSO is not configured on this server' });

  const { code } = req.query;
  if (!code) return res.redirect(`${frontendUrl}/login?ssoError=missing_code`);

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.error_description || 'Token exchange failed');

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();
    if (!profileRes.ok || !profile.email) throw new Error('Could not fetch Google profile');

    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.status, u.region_id, u.partner_id, r.code AS role_code
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ? OR (u.sso_provider = 'google' AND u.sso_subject = ?)`,
      [profile.email, profile.sub]
    );
    const user = rows[0];
    if (!user) {
      return res.redirect(`${frontendUrl}/login?ssoError=no_account`);
    }
    if (user.status !== 'active') {
      return res.redirect(`${frontendUrl}/login?ssoError=inactive_account`);
    }

    await pool.query(
      `UPDATE users SET sso_provider = 'google', sso_subject = ?, last_login_at = NOW() WHERE id = ?`,
      [profile.sub, user.id]
    );
    await pool.query(
      `INSERT INTO access_audit_log (user_id, action, entity_type, entity_id) VALUES (?, 'LOGIN_SSO', 'user', ?)`,
      [user.id, user.id]
    );

    const { token } = issueSession(user);
    res.redirect(`${frontendUrl}/sso-callback#token=${token}`);
  } catch (err) {
    console.error('Google SSO error:', err);
    res.redirect(`${frontendUrl}/login?ssoError=1`);
  }
}

module.exports = { login, me, ssoStatus, googleLogin, googleCallback };
