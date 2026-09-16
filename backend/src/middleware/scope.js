const { GLOBAL_SCOPE_ROLES, REGION_SCOPE_ROLES, PARTNER_SCOPE_ROLES, ROLES } = require('../utils/roles');

/**
 * ============================================================
 * QUERY-LEVEL DATA SCOPING (BRD Section 7.1, final note):
 * "Access control should be enforced at the data-query level
 *  (not just UI hiding) so a partner in Country A can never
 *  retrieve Country B's institute list, pricing, or collateral
 *  even via direct API/URL manipulation."
 *
 * Every controller that reads/writes region- or partner-scoped
 * tables MUST call buildScopeClause() and AND it into its SQL,
 * rather than relying on the client to send the "right" filters.
 * ============================================================
 */

/**
 * @param {object} user - req.user (from requireAuth)
 * @param {object} opts
 * @param {string} opts.regionColumn - column name for region_id in the target table/alias (e.g. 'i.region_id')
 * @param {string} [opts.partnerColumn] - column name for partner_id in the target table/alias (e.g. 'd.partner_id')
 * @returns {{ clause: string, params: any[] }} - SQL fragment (starts with 'AND ...') and bound params
 */
function buildScopeClause(user, { regionColumn, partnerColumn } = {}) {
  if (!user) throw new Error('buildScopeClause called without an authenticated user');

  // Global roles: no restriction.
  if (GLOBAL_SCOPE_ROLES.includes(user.roleCode)) {
    return { clause: '', params: [] };
  }

  // Region-scoped roles: restrict to their own region.
  if (REGION_SCOPE_ROLES.includes(user.roleCode)) {
    if (!regionColumn) throw new Error(`No regionColumn provided for region-scoped role ${user.roleCode}`);
    if (!user.regionId) return { clause: 'AND 1=0', params: [] }; // no region assigned -> see nothing
    return { clause: `AND ${regionColumn} = ?`, params: [user.regionId] };
  }

  // Partner-scoped roles: restrict to their own partner org.
  if (PARTNER_SCOPE_ROLES.includes(user.roleCode)) {
    if (!partnerColumn) throw new Error(`No partnerColumn provided for partner-scoped role ${user.roleCode}`);
    if (!user.partnerId) return { clause: 'AND 1=0', params: [] };
    return { clause: `AND ${partnerColumn} = ?`, params: [user.partnerId] };
  }

  // Academia Sales: sees deals where they are the named account manager;
  // callers pass a dedicated column for this (handled per-controller).
  if (user.roleCode === ROLES.ACADEMIA_SALES) {
    return { clause: '', params: [] }; // controller applies its own am-specific filter
  }

  // Unknown role: fail closed.
  return { clause: 'AND 1=0', params: [] };
}

/**
 * Narrower helper for Partner Sales Users, who are further restricted to
 * institutes/deals *assigned to them*, not just their whole partner org.
 * Regional/Global/Partner Admin see the full partner-level or region-level set.
 */
function isPartnerSalesUser(user) {
  return user.roleCode === ROLES.PARTNER_SALES_USER;
}

module.exports = { buildScopeClause, isPartnerSalesUser };
