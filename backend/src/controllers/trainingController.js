const pool = require('../config/db');
const { fileTypeFromExt } = require('../utils/upload');

// ------------------------------------------------------------
// Training type master (Add / Modify / Delete)
// ------------------------------------------------------------

async function listTrainingTypes(req, res) {
  const [rows] = await pool.query('SELECT id, name FROM training_types ORDER BY name');
  res.json(rows);
}

async function createTrainingType(req, res) {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const [result] = await pool.query('INSERT INTO training_types (name) VALUES (?)', [name]);
    res.status(201).json({ id: result.insertId, name });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A training type with this name already exists' });
    throw err;
  }
}

async function updateTrainingType(req, res) {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  await pool.query('UPDATE training_types SET name = ? WHERE id = ?', [name, req.params.id]);
  res.json({ id: Number(req.params.id), name });
}

async function deleteTrainingType(req, res) {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM training_batches WHERE training_type_id = ?', [req.params.id]);
  if (n) return res.status(409).json({ error: 'This training type has batches associated with it and cannot be deleted.' });
  await pool.query('DELETE FROM training_types WHERE id = ?', [req.params.id]);
  res.json({ id: Number(req.params.id), deleted: true });
}

// ------------------------------------------------------------
// Certification type master (Add / Modify / Delete)
// ------------------------------------------------------------

async function listCertificationTypes(req, res) {
  const [rows] = await pool.query('SELECT id, name FROM certification_types ORDER BY name');
  res.json(rows);
}

async function createCertificationType(req, res) {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const [result] = await pool.query('INSERT INTO certification_types (name) VALUES (?)', [name]);
    res.status(201).json({ id: result.insertId, name });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A certification type with this name already exists' });
    throw err;
  }
}

async function updateCertificationType(req, res) {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  await pool.query('UPDATE certification_types SET name = ? WHERE id = ?', [name, req.params.id]);
  res.json({ id: Number(req.params.id), name });
}

async function deleteCertificationType(req, res) {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM training_batches WHERE certification_type_id = ?', [req.params.id]);
  if (n) return res.status(409).json({ error: 'This certification type has batches associated with it and cannot be deleted.' });
  await pool.query('DELETE FROM certification_types WHERE id = ?', [req.params.id]);
  res.json({ id: Number(req.params.id), deleted: true });
}

// ------------------------------------------------------------
// Batches
// ------------------------------------------------------------

// GET /api/training/batches
async function listBatches(req, res) {
  const [rows] = await pool.query(
    `SELECT b.id, b.category, b.name, b.start_date, b.end_date,
            b.training_type_id, tt.name AS training_type_name,
            b.certification_type_id, ct.name AS certification_type_name,
            (SELECT COUNT(*) FROM batch_enrollments be WHERE be.batch_id = b.id) AS enrolled_count
     FROM training_batches b
     LEFT JOIN training_types tt ON tt.id = b.training_type_id
     LEFT JOIN certification_types ct ON ct.id = b.certification_type_id
     ORDER BY b.start_date DESC`
  );
  res.json(rows);
}

// POST /api/training/batches
async function createBatch(req, res) {
  const { category, trainingTypeId, certificationTypeId, name, startDate, endDate } = req.body;
  if (!['training', 'certification'].includes(category)) return res.status(400).json({ error: "category must be 'training' or 'certification'" });
  if (!name || !startDate || !endDate) return res.status(400).json({ error: 'name, startDate and endDate are required' });
  if (category === 'training' && !trainingTypeId) return res.status(400).json({ error: 'trainingTypeId is required for a training batch' });
  if (category === 'certification' && !certificationTypeId) return res.status(400).json({ error: 'certificationTypeId is required for a certification batch' });

  const [result] = await pool.query(
    `INSERT INTO training_batches (category, training_type_id, certification_type_id, name, start_date, end_date, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [category, category === 'training' ? trainingTypeId : null, category === 'certification' ? certificationTypeId : null,
     name, startDate, endDate, req.user.id]
  );
  res.status(201).json({ id: result.insertId });
}

async function updateBatch(req, res) {
  const { name, startDate, endDate } = req.body;
  await pool.query(
    `UPDATE training_batches SET name = COALESCE(?, name), start_date = COALESCE(?, start_date), end_date = COALESCE(?, end_date) WHERE id = ?`,
    [name || null, startDate || null, endDate || null, req.params.id]
  );
  res.json({ id: Number(req.params.id), updated: true });
}

async function deleteBatch(req, res) {
  await pool.query('DELETE FROM training_batches WHERE id = ?', [req.params.id]);
  res.json({ id: Number(req.params.id), deleted: true });
}

// GET /api/training/batches/:id -- with enrollments + certificate status
async function getBatch(req, res) {
  const [[batch]] = await pool.query(
    `SELECT b.id, b.category, b.name, b.start_date, b.end_date,
            b.training_type_id, tt.name AS training_type_name,
            b.certification_type_id, ct.name AS certification_type_name
     FROM training_batches b
     LEFT JOIN training_types tt ON tt.id = b.training_type_id
     LEFT JOIN certification_types ct ON ct.id = b.certification_type_id
     WHERE b.id = ?`,
    [req.params.id]
  );
  if (!batch) return res.status(404).json({ error: 'Batch not found' });

  const [enrollments] = await pool.query(
    `SELECT be.id, be.user_id, u.first_name, u.last_name, u.email, p.company_name AS partner_name, be.status,
            cr.id AS certificate_id, cr.certificate_file_url, cr.certificate_file_type
     FROM batch_enrollments be
     JOIN users u ON u.id = be.user_id
     LEFT JOIN partners p ON p.id = u.partner_id
     LEFT JOIN certification_records cr ON cr.batch_enrollment_id = be.id
     WHERE be.batch_id = ?`,
    [req.params.id]
  );
  res.json({ ...batch, enrollments });
}

// POST /api/training/batches/:id/enroll -- enroll one or more partner personnel
async function enroll(req, res) {
  const { userIds } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0) return res.status(400).json({ error: 'userIds must be a non-empty array' });

  for (const userId of userIds) {
    await pool.query(
      'INSERT IGNORE INTO batch_enrollments (batch_id, user_id) VALUES (?, ?)',
      [req.params.id, userId]
    );
  }
  res.status(201).json({ batchId: Number(req.params.id), enrolled: userIds.length });
}

// PATCH /api/training/enrollments/:id -- mark completed / no-show
async function updateEnrollment(req, res) {
  const { status } = req.body;
  if (!['enrolled', 'completed', 'no_show'].includes(status)) return res.status(400).json({ error: 'invalid status' });
  await pool.query('UPDATE batch_enrollments SET status = ? WHERE id = ?', [status, req.params.id]);
  res.json({ id: Number(req.params.id), status });
}

// POST /api/training/enrollments/:id/certificate -- upload the completed certificate (PDF/JPEG/JPG/PNG),
// attached to the participant's partner profile via the enrollment -> user -> partner chain.
async function issueCertificate(req, res) {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  const fileType = fileTypeFromExt(req.file.originalname);
  const fileUrl = `/uploads/certificates/${req.file.filename}`;

  const [result] = await pool.query(
    `INSERT INTO certification_records (batch_enrollment_id, certificate_file_url, certificate_file_type, issued_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE certificate_file_url = VALUES(certificate_file_url), certificate_file_type = VALUES(certificate_file_type), issued_by = VALUES(issued_by)`,
    [req.params.id, fileUrl, fileType, req.user.id]
  );
  await pool.query(`UPDATE batch_enrollments SET status = 'completed' WHERE id = ?`, [req.params.id]);
  res.status(201).json({ id: result.insertId, fileUrl });
}

// GET /api/training/my-batches -- current user's enrollment history
async function myBatches(req, res) {
  const [rows] = await pool.query(
    `SELECT b.id AS batch_id, b.category, b.name, b.start_date, b.end_date,
            tt.name AS training_type_name, ct.name AS certification_type_name,
            be.id AS enrollment_id, be.status,
            cr.certificate_file_url, cr.certificate_file_type
     FROM batch_enrollments be
     JOIN training_batches b ON b.id = be.batch_id
     LEFT JOIN training_types tt ON tt.id = b.training_type_id
     LEFT JOIN certification_types ct ON ct.id = b.certification_type_id
     LEFT JOIN certification_records cr ON cr.batch_enrollment_id = be.id
     WHERE be.user_id = ?
     ORDER BY b.start_date DESC`,
    [req.user.id]
  );
  res.json(rows);
}

module.exports = {
  listTrainingTypes, createTrainingType, updateTrainingType, deleteTrainingType,
  listCertificationTypes, createCertificationType, updateCertificationType, deleteCertificationType,
  listBatches, createBatch, updateBatch, deleteBatch, getBatch,
  enroll, updateEnrollment, issueCertificate, myBatches,
};
