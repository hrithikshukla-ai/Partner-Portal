const express = require('express');
const router = express.Router();
const ah = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../utils/roles');
const ctrl = require('../controllers/hierarchyController');

const ADMIN_ONLY = requireRole(ROLES.SUPER_ADMIN, ROLES.GLOBAL_PARTNER_MANAGER);

router.patch('/:id', requireAuth, ADMIN_ONLY, ah(ctrl.updateCountry));
router.delete('/:id', requireAuth, ADMIN_ONLY, ah(ctrl.deleteCountry));

module.exports = router;
