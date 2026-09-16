const express = require('express');
const router = express.Router();

router.use('/auth', require('./authRoutes'));
router.use('/partners', require('./partnerRoutes'));
router.use('/regions', require('./hierarchyRoutes'));
router.use('/countries', require('./countryRoutes'));
router.use('/tiers', require('./tierRoutes'));
router.use('/institutes', require('./instituteRoutes'));
router.use('/deals', require('./dealRoutes'));
router.use('/collateral', require('./collateralRoutes'));
router.use('/cadence', require('./cadenceRoutes'));
router.use('/training', require('./trainingRoutes'));
router.use('/dashboards', require('./dashboardRoutes'));
router.use('/notifications', require('./notificationRoutes'));
router.use('/incentives', require('./incentiveRoutes'));
router.use('/users', require('./userRoutes'));

module.exports = router;
