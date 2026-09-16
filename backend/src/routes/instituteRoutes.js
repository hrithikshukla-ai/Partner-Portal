const express = require('express');
const router = express.Router();
const ah = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../utils/roles');
const ctrl = require('../controllers/instituteController');

const CAN_MANAGE = requireRole(ROLES.SUPER_ADMIN, ROLES.GLOBAL_PARTNER_MANAGER, ROLES.REGIONAL_PARTNER_MANAGER);

router.get('/personas', requireAuth, ah(ctrl.listPersonas));

router.post('/', requireAuth, CAN_MANAGE, ah(ctrl.createInstitute));
router.get('/', requireAuth, ah(ctrl.listInstitutes));
router.get('/:id', requireAuth, ah(ctrl.getInstitute));
router.patch('/:id', requireAuth, CAN_MANAGE, ah(ctrl.updateInstitute));
router.delete('/:id', requireAuth, CAN_MANAGE, ah(ctrl.deleteInstitute));
router.post('/:id/contacts', requireAuth, ah(ctrl.addContact));
router.post('/:id/notes', requireAuth, ah(ctrl.addNote));
router.patch('/:id/assign', requireAuth, CAN_MANAGE, ah(ctrl.assignPartner));

module.exports = router;
