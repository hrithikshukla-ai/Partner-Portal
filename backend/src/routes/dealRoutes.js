const express = require('express');
const router = express.Router();
const ah = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../utils/roles');
const ctrl = require('../controllers/dealController');

const CAN_APPROVE = requireRole(ROLES.SUPER_ADMIN, ROLES.GLOBAL_PARTNER_MANAGER, ROLES.REGIONAL_PARTNER_MANAGER);

router.post('/', requireAuth, ah(ctrl.registerDeal));
router.get('/', requireAuth, ah(ctrl.listDeals));
router.patch('/:id/approve', requireAuth, CAN_APPROVE, ah(ctrl.approveDeal));
router.patch('/:id/stage', requireAuth, ah(ctrl.updateStage));
router.patch('/:id/close', requireAuth, ah(ctrl.closeDeal));

module.exports = router;
