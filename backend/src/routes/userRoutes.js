const express = require('express');
const router = express.Router();
const ah = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../utils/roles');
const ctrl = require('../controllers/userController');

const CAN_MANAGE_USERS = requireRole(
  ROLES.SUPER_ADMIN, ROLES.GLOBAL_PARTNER_MANAGER, ROLES.REGIONAL_PARTNER_MANAGER, ROLES.PARTNER_ADMIN
);

router.post('/activate', ah(ctrl.activate)); // public — token-gated

router.get('/', requireAuth, ah(ctrl.listUsers));
router.post('/', requireAuth, CAN_MANAGE_USERS, ah(ctrl.createUser));
router.patch('/me/password', requireAuth, ah(ctrl.changeOwnPassword));
router.get('/:id', requireAuth, ah(ctrl.getUser));
router.patch('/:id', requireAuth, ah(ctrl.updateUser));
router.patch('/:id/status', requireAuth, CAN_MANAGE_USERS, ah(ctrl.setStatus));
router.patch('/:id/password', requireAuth, CAN_MANAGE_USERS, ah(ctrl.adminSetPassword));
router.delete('/:id', requireAuth, CAN_MANAGE_USERS, ah(ctrl.deleteUser));

module.exports = router;
