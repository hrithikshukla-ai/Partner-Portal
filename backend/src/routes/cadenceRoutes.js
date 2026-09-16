const express = require('express');
const router = express.Router();
const ah = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/cadenceController');

router.post('/meetings', requireAuth, ah(ctrl.scheduleMeeting));
router.get('/meetings', requireAuth, ah(ctrl.listMeetings));
router.get('/meetings/:id/action-items', requireAuth, ah(ctrl.listActionItems));
router.post('/meetings/:id/action-items', requireAuth, ah(ctrl.addActionItem));
router.patch('/action-items/:id', requireAuth, ah(ctrl.updateActionItem));
router.get('/partners/:partnerId/history', requireAuth, ah(ctrl.partnerCadenceHistory));

module.exports = router;
