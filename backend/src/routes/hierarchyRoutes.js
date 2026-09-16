const express = require('express');
const router = express.Router();
const ah = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../utils/roles');
const ctrl = require('../controllers/hierarchyController');

const ADMIN_ONLY = requireRole(ROLES.SUPER_ADMIN, ROLES.GLOBAL_PARTNER_MANAGER);

router.get('/', requireAuth, ah(ctrl.listRegions));
router.post('/', requireAuth, ADMIN_ONLY, ah(ctrl.createRegion));
router.patch('/:id', requireAuth, ADMIN_ONLY, ah(ctrl.updateRegion));
router.delete('/:id', requireAuth, ADMIN_ONLY, ah(ctrl.deleteRegion));

router.get('/:id/countries', requireAuth, ah(ctrl.listCountries));
router.post('/:id/countries', requireAuth, ADMIN_ONLY, ah(ctrl.addCountry));

router.post('/:id/assign-manager', requireAuth, ADMIN_ONLY, ah(ctrl.assignRegionalManager));

module.exports = router;
