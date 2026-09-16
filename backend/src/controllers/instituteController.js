const pool = require('../config/db');
const { ROLES, GLOBAL_SCOPE_ROLES, REGION_SCOPE_ROLES } = require('../utils/roles');

// POST /api/institutes -- create a target account (dedup enforced by DB unique key on name+website)
async function createInstitute(req, res) {
  const {
    name, website, studentCount, campusCount, personaId, type, countryId, regionId,
    isExistingClient, assignedPartnerId,
    contactName, contactDesignation, contactEmail, contactDialingCode, contactPhone,
  } = req.body;
  if (!name || !personaId || !countryId || !regionId) {
    return res.status(400).json({ error: 'name, personaId, countryId and regionId are required' });
  }

  if (req.user.roleCode === ROLES.REGIONAL_PARTNER_MANAGER && regionId !== req.user.regionId) {
    return res.status(403).json({ error: 'Cannot create an institute outside your region' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO institutes (name, website, student_count, campus_count, persona_id, type, country_id, region_id,
                               contact_name, contact_designation, contact_email, contact_dialing_code, contact_phone,
                               is_existing_client, assigned_partner_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, website || null, studentCount || null, campusCount || null, personaId, type || 'Private', countryId, regionId,
       contactName || null, contactDesignation || null, contactEmail || null, contactDialingCode || null, contactPhone || null,
       !!isExistingClient, assignedPartnerId || null]
    );
    res.status(201).json({ id: result.insertId, name });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An institute with this name/website already exists (dedup on import).' });
    }
    throw err;
  }
}

// GET /api/institutes -- scoped by region/partner assignment, with optional filters
async function listInstitutes(req, res) {
  const user = req.user;
  const { partnerId, regionId, countryId } = req.query;

  let where = '1=1';
  const params = [];

  if (GLOBAL_SCOPE_ROLES.includes(user.roleCode)) {
    // no restriction
  } else if (REGION_SCOPE_ROLES.includes(user.roleCode)) {
    where += ' AND i.region_id = ?';
    params.push(user.regionId || 0);
  } else if ([ROLES.PARTNER_ADMIN, ROLES.PARTNER_SALES_USER].includes(user.roleCode)) {
    where += ' AND i.assigned_partner_id = ?';
    params.push(user.partnerId || 0);
  } else if (user.roleCode !== ROLES.ACADEMIA_SALES) {
    where += ' AND 1=0';
  }

  if (partnerId) { where += ' AND i.assigned_partner_id = ?'; params.push(partnerId); }
  if (regionId) { where += ' AND i.region_id = ?'; params.push(regionId); }
  if (countryId) { where += ' AND i.country_id = ?'; params.push(countryId); }

  const [rows] = await pool.query(
    `SELECT i.id, i.name, i.website, i.student_count, i.campus_count, i.type, i.is_existing_client,
            i.contact_name, i.contact_designation, i.contact_email, i.contact_dialing_code, i.contact_phone,
            per.name AS persona, per.id AS persona_id, c.id AS country_id, c.name AS country,
            r.id AS region_id, r.name AS region,
            i.assigned_partner_id, p.company_name AS assigned_partner_name
     FROM institutes i
     JOIN personas per ON per.id = i.persona_id
     JOIN countries c ON c.id = i.country_id
     JOIN regions r ON r.id = i.region_id
     LEFT JOIN partners p ON p.id = i.assigned_partner_id
     WHERE ${where}
     ORDER BY i.name`,
    params
  );
  res.json(rows);
}

// GET /api/institutes/:id -- with contacts and notes
async function getInstitute(req, res) {
  const id = req.params.id;
  const [[institute]] = await pool.query(
    `SELECT i.*, per.name AS persona, c.name AS country, r.name AS region
     FROM institutes i
     JOIN personas per ON per.id = i.persona_id
     JOIN countries c ON c.id = i.country_id
     JOIN regions r ON r.id = i.region_id
     WHERE i.id = ?`,
    [id]
  );
  if (!institute) return res.status(404).json({ error: 'Institute not found' });

  if (req.user.roleCode === ROLES.REGIONAL_PARTNER_MANAGER && institute.region_id !== req.user.regionId) {
    return res.status(403).json({ error: 'Institute is outside your region' });
  }
  if ([ROLES.PARTNER_ADMIN, ROLES.PARTNER_SALES_USER].includes(req.user.roleCode) && institute.assigned_partner_id !== req.user.partnerId) {
    return res.status(403).json({ error: 'Institute is not assigned to your organisation' });
  }

  const [contacts] = await pool.query('SELECT id, name, designation, email, dialing_code, phone FROM institute_contacts WHERE institute_id = ?', [id]);
  const [notes] = await pool.query(
    `SELECT n.id, n.note, n.created_at, u.first_name, u.last_name
     FROM institute_notes n JOIN users u ON u.id = n.author_id WHERE n.institute_id = ? ORDER BY n.created_at DESC`,
    [id]
  );

  res.json({ ...institute, contacts, notes });
}

// PATCH /api/institutes/:id -- edit core fields
async function updateInstitute(req, res) {
  const id = req.params.id;
  const {
    name, website, studentCount, campusCount, personaId, type, countryId, regionId,
    isExistingClient, contactName, contactDesignation, contactEmail, contactDialingCode, contactPhone,
  } = req.body;

  const [[institute]] = await pool.query('SELECT id, region_id FROM institutes WHERE id = ?', [id]);
  if (!institute) return res.status(404).json({ error: 'Institute not found' });
  if (req.user.roleCode === ROLES.REGIONAL_PARTNER_MANAGER && institute.region_id !== req.user.regionId) {
    return res.status(403).json({ error: 'Institute is outside your region' });
  }

  await pool.query(
    `UPDATE institutes SET name = COALESCE(?, name), website = ?, student_count = ?, campus_count = ?,
            persona_id = COALESCE(?, persona_id), type = COALESCE(?, type),
            country_id = COALESCE(?, country_id), region_id = COALESCE(?, region_id),
            is_existing_client = COALESCE(?, is_existing_client),
            contact_name = ?, contact_designation = ?, contact_email = ?, contact_dialing_code = ?, contact_phone = ?
     WHERE id = ?`,
    [name, website || null, studentCount || null, campusCount || null, personaId || null, type || null,
     countryId || null, regionId || null, isExistingClient == null ? null : !!isExistingClient,
     contactName || null, contactDesignation || null, contactEmail || null, contactDialingCode || null, contactPhone || null, id]
  );
  res.json({ id: Number(id), updated: true });
}

// DELETE /api/institutes/:id
async function deleteInstitute(req, res) {
  const id = req.params.id;
  try {
    await pool.query('DELETE FROM institutes WHERE id = ?', [id]);
    res.json({ id: Number(id), deleted: true });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(409).json({ error: 'This target account has deals or activity on record and cannot be deleted.' });
    }
    throw err;
  }
}

// POST /api/institutes/:id/contacts
async function addContact(req, res) {
  const { name, designation, email, dialingCode, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const [result] = await pool.query(
    'INSERT INTO institute_contacts (institute_id, name, designation, email, dialing_code, phone) VALUES (?, ?, ?, ?, ?, ?)',
    [req.params.id, name, designation || null, email || null, dialingCode || null, phone || null]
  );
  res.status(201).json({ id: result.insertId });
}

// POST /api/institutes/:id/notes
async function addNote(req, res) {
  const { note } = req.body;
  if (!note) return res.status(400).json({ error: 'note is required' });
  const [result] = await pool.query(
    'INSERT INTO institute_notes (institute_id, author_id, note) VALUES (?, ?, ?)',
    [req.params.id, req.user.id, note]
  );
  res.status(201).json({ id: result.insertId });
}

// PATCH /api/institutes/:id/assign -- assign ownership to a partner (Academia oversight)
async function assignPartner(req, res) {
  const { partnerId } = req.body;
  await pool.query('UPDATE institutes SET assigned_partner_id = ? WHERE id = ?', [partnerId || null, req.params.id]);
  res.json({ instituteId: Number(req.params.id), assignedPartnerId: partnerId || null });
}

// GET /api/institutes/personas -- category master (read-only for now, mirrors the seeded list)
async function listPersonas(req, res) {
  const [rows] = await pool.query('SELECT id, name FROM personas ORDER BY id');
  res.json(rows);
}

module.exports = {
  createInstitute, listInstitutes, getInstitute, updateInstitute, deleteInstitute,
  addContact, addNote, assignPartner, listPersonas,
};
