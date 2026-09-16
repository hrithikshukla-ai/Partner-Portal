const express = require('express');
const router = express.Router();
const ah = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../utils/roles');
const ctrl = require('../controllers/hierarchyController');

const ADMIN_ONLY = requireRole(ROLES.SUPER_ADMIN, ROLES.GLOBAL_PARTNER_MANAGER);

router.get('/', requireAuth, ah(ctrl.listTiers));
router.post('/', requireAuth, ADMIN_ONLY, ah(ctrl.createTier));
router.patch('/:id', requireAuth, ADMIN_ONLY, ah(ctrl.updateTier));
router.delete('/:id', requireAuth, ADMIN_ONLY, ah(ctrl.deleteTier));

module.exports = router;
