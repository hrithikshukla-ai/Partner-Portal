const express = require('express');
const router = express.Router();
const ah = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../utils/roles');
const ctrl = require('../controllers/incentiveController');

router.post('/mdf', requireAuth, requireRole(ROLES.PARTNER_ADMIN, ROLES.PARTNER_SALES_USER), ah(ctrl.requestMdf));
router.patch('/mdf/:id/decision', requireAuth, requireRole(ROLES.REGIONAL_PARTNER_MANAGER, ROLES.GLOBAL_PARTNER_MANAGER, ROLES.SUPER_ADMIN), ah(ctrl.decideMdf));
router.get('/mdf', requireAuth, ah(ctrl.listMdf));
router.get('/commissions', requireAuth, ah(ctrl.listCommissions));

module.exports = router;
