const express = require('express');
const router = express.Router();
const ah = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/authController');

router.post('/login', ah(ctrl.login));
router.get('/me', requireAuth, ah(ctrl.me));

router.get('/sso/status', ctrl.ssoStatus);
router.get('/sso/google/login', ctrl.googleLogin);
router.get('/sso/google/callback', ah(ctrl.googleCallback));

module.exports = router;
