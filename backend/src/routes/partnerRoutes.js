const express = require('express');
const router = express.Router();
const ah = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../utils/roles');
const { uploadDocument } = require('../utils/upload');
const ctrl = require('../controllers/partnerController');

const CAN_MANAGE_PARTNERS = requireRole(ROLES.SUPER_ADMIN, ROLES.GLOBAL_PARTNER_MANAGER, ROLES.REGIONAL_PARTNER_MANAGER);

router.post('/apply', ah(ctrl.applyAsPartner)); // public onboarding application
router.post('/', requireAuth, CAN_MANAGE_PARTNERS, ah(ctrl.createPartner));
router.get('/', requireAuth, ah(ctrl.listPartners));
router.get('/:id', requireAuth, ah(ctrl.getPartner));
router.patch('/:id', requireAuth, CAN_MANAGE_PARTNERS, ah(ctrl.updatePartner));
router.patch('/:id/tier', requireAuth, CAN_MANAGE_PARTNERS, ah(ctrl.changeTier));
router.patch('/:id/status', requireAuth, CAN_MANAGE_PARTNERS, ah(ctrl.changeStatus));

router.post('/:id/users', requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.GLOBAL_PARTNER_MANAGER, ROLES.REGIONAL_PARTNER_MANAGER, ROLES.PARTNER_ADMIN), ah(ctrl.inviteUser));

router.post('/:id/documents', requireAuth, uploadDocument.single('file'), ah(ctrl.addDocument));
router.patch('/:id/documents/:docId', requireAuth, uploadDocument.single('file'), ah(ctrl.updateDocument));
router.delete('/:id/documents/:docId', requireAuth, ah(ctrl.deleteDocument));

router.get('/:id/tier-eligibility', requireAuth, ah(ctrl.tierEligibility));

module.exports = router;
