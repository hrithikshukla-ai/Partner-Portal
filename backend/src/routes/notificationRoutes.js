const express = require('express');
const router = express.Router();
const ah = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../utils/roles');
const ctrl = require('../controllers/notificationController');

router.get('/', requireAuth, ah(ctrl.myNotifications));
router.patch('/:id/read', requireAuth, ah(ctrl.markRead));
router.post('/broadcast', requireAuth, requireRole(ROLES.GLOBAL_PARTNER_MANAGER, ROLES.REGIONAL_PARTNER_MANAGER, ROLES.SUPER_ADMIN), ah(ctrl.broadcast));

module.exports = router;
