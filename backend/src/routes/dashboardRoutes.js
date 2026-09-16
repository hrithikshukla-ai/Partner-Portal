const express = require('express');
const router = express.Router();
const ah = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../utils/roles');
const ctrl = require('../controllers/dashboardController');

router.get('/partner', requireAuth, requireRole(ROLES.PARTNER_ADMIN, ROLES.PARTNER_SALES_USER), ah(ctrl.partnerDashboard));
router.get('/regional', requireAuth, requireRole(ROLES.REGIONAL_PARTNER_MANAGER, ROLES.GLOBAL_PARTNER_MANAGER, ROLES.SUPER_ADMIN), ah(ctrl.regionalDashboard));
router.get('/global', requireAuth, requireRole(ROLES.GLOBAL_PARTNER_MANAGER, ROLES.SUPER_ADMIN), ah(ctrl.globalDashboard));
router.post('/business-plan', requireAuth, requireRole(ROLES.GLOBAL_PARTNER_MANAGER, ROLES.SUPER_ADMIN), ah(ctrl.setBusinessPlanTarget));

module.exports = router;
