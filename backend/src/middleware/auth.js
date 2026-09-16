const jwt = require('jsonwebtoken');

/**
 * Verifies the JWT and attaches the decoded, server-issued identity to req.user.
 * req.user is the ONLY source of truth for role/region/partner scoping —
 * never trust region_id/partner_id/role from the request body or query string.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: payload.id,
      email: payload.email,
      roleCode: payload.roleCode,
      regionId: payload.regionId || null,
      partnerId: payload.partnerId || null,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Restricts a route to a fixed set of role codes.
 */
function requireRole(...allowedRoleCodes) {
  return (req, res, next) => {
    if (!req.user || !allowedRoleCodes.includes(req.user.roleCode)) {
      return res.status(403).json({ error: 'Insufficient role for this action' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
