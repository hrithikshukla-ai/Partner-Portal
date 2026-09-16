// Module nav — mirrors BRD Section 8. `roles: null` means visible to everyone logged in.
export const NAV = [
  { path: '/', label: 'Dashboard', roles: null },
  { path: '/partners', label: 'Partners', roles: ['SUPER_ADMIN', 'GLOBAL_PARTNER_MANAGER', 'REGIONAL_PARTNER_MANAGER'] },
  { path: '/hierarchy', label: 'Region & Access', roles: ['SUPER_ADMIN', 'GLOBAL_PARTNER_MANAGER'] },
  { path: '/institutes', label: 'Target Accounts', roles: null },
  { path: '/deals', label: 'Deals & Pipeline', roles: null },
  { path: '/collateral', label: 'Collateral Library', roles: null },
  { path: '/cadence', label: 'Cadence & MoM', roles: null },
  { path: '/training', label: 'Training & Certification', roles: null },
  { path: '/notifications', label: 'Notifications', roles: null },
  { path: '/incentives', label: 'MDF & Commissions', roles: null },
  { path: '/users', label: 'Users', roles: ['SUPER_ADMIN', 'GLOBAL_PARTNER_MANAGER', 'REGIONAL_PARTNER_MANAGER', 'PARTNER_ADMIN'] },
];

export function visibleNav(roleCode) {
  return NAV.filter((item) => !item.roles || item.roles.includes(roleCode));
}
