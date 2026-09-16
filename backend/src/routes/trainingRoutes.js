const express = require('express');
const router = express.Router();
const ah = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../utils/roles');
const { uploadCertificate } = require('../utils/upload');
const ctrl = require('../controllers/trainingController');

const CAN_MANAGE = requireRole(ROLES.SUPER_ADMIN, ROLES.GLOBAL_PARTNER_MANAGER, ROLES.REGIONAL_PARTNER_MANAGER, ROLES.ACADEMIA_MARKETING);

router.get('/types', requireAuth, ah(ctrl.listTrainingTypes));
router.post('/types', requireAuth, CAN_MANAGE, ah(ctrl.createTrainingType));
router.patch('/types/:id', requireAuth, CAN_MANAGE, ah(ctrl.updateTrainingType));
router.delete('/types/:id', requireAuth, CAN_MANAGE, ah(ctrl.deleteTrainingType));

router.get('/certification-types', requireAuth, ah(ctrl.listCertificationTypes));
router.post('/certification-types', requireAuth, CAN_MANAGE, ah(ctrl.createCertificationType));
router.patch('/certification-types/:id', requireAuth, CAN_MANAGE, ah(ctrl.updateCertificationType));
router.delete('/certification-types/:id', requireAuth, CAN_MANAGE, ah(ctrl.deleteCertificationType));

router.get('/batches', requireAuth, ah(ctrl.listBatches));
router.post('/batches', requireAuth, CAN_MANAGE, ah(ctrl.createBatch));
router.get('/batches/:id', requireAuth, ah(ctrl.getBatch));
router.patch('/batches/:id', requireAuth, CAN_MANAGE, ah(ctrl.updateBatch));
router.delete('/batches/:id', requireAuth, CAN_MANAGE, ah(ctrl.deleteBatch));
router.post('/batches/:id/enroll', requireAuth, CAN_MANAGE, ah(ctrl.enroll));

router.patch('/enrollments/:id', requireAuth, CAN_MANAGE, ah(ctrl.updateEnrollment));
router.post('/enrollments/:id/certificate', requireAuth, CAN_MANAGE, uploadCertificate.single('file'), ah(ctrl.issueCertificate));

router.get('/my-batches', requireAuth, ah(ctrl.myBatches));

module.exports = router;
