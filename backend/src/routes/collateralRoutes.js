const express = require('express');
const router = express.Router();
const ah = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../utils/roles');
const ctrl = require('../controllers/collateralController');

const CAN_PUBLISH = requireRole(ROLES.SUPER_ADMIN, ROLES.GLOBAL_PARTNER_MANAGER, ROLES.ACADEMIA_MARKETING);

router.post('/', requireAuth, CAN_PUBLISH, ah(ctrl.createAsset));
router.post('/:id/versions', requireAuth, CAN_PUBLISH, ah(ctrl.addVersion));
router.patch('/:id/publish', requireAuth, CAN_PUBLISH, ah(ctrl.publishVersion));
router.get('/', requireAuth, ah(ctrl.listAssets));
router.post('/:id/download', requireAuth, ah(ctrl.downloadAsset));

router.get('/requests', requireAuth, ah(ctrl.listCustomRequests));
router.post('/requests', requireAuth, requireRole(ROLES.PARTNER_ADMIN, ROLES.PARTNER_SALES_USER), ah(ctrl.requestCustomAsset));
router.patch('/requests/:id', requireAuth, CAN_PUBLISH, ah(ctrl.updateCustomRequestStatus));

module.exports = router;
