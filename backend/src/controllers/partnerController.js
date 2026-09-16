const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { buildScopeClause } = require('../middleware/scope');
const { ROLES } = require('../utils/roles');
const { sendMail } = require('../utils/mailer');

async function lowestTierId() {
  const [[row]] = await pool.query('SELECT id FROM tiers ORDER BY rank_order ASC LIMIT 1');
  return row ? row.id : null;
}

// Shared by the public application endpoint and the admin "add partner" form.
async function createPartnerRecord({ companyName, regionId, countryIds, salesTeamSize, existingSisErpExperience, timezone, actorUserId }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const tierId = await lowestTierId();

    const [result] = await conn.query(
      `INSERT INTO partners (company_name, region_id, sales_team_size, existing_sis_erp_experience, tier_id, timezone, status, signup_date)
       VALUES (?, ?, ?, ?, ?, ?, 'applied', CURDATE())`,
      [companyName, regionId, salesTeamSize || null, existingSisErpExperience || null, tierId, timezone || null]
    );
    const partnerId = result.insertId;

    for (const countryId of countryIds) {
      await conn.query('INSERT INTO partner_countries (partner_id, country_id) VALUES (?, ?)', [partnerId, countryId]);
    }

    await conn.query(
      `INSERT INTO partner_history (partner_id, event_type, new_value, changed_by, note)
       VALUES (?, 'status_change', 'applied', ?, 'Initial application submitted')`,
      [partnerId, actorUserId || null]
    );

    await conn.commit();
    return partnerId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// POST /api/partners/apply  -- public-ish onboarding application (Module 1)
async function applyAsPartner(req, res) {
  const { companyName, regionId, countryIds, salesTeamSize, existingSisErpExperience } = req.body;
  if (!companyName || !regionId || !Array.isArray(countryIds) || countryIds.length === 0) {
    return res.status(400).json({ error: 'companyName, regionId and at least one countryId are required' });
  }
  const partnerId = await createPartnerRecord({
    companyName, regionId, countryIds, salesTeamSize, existingSisErpExperience,
    actorUserId: req.user ? req.user.id : null,
  });
  res.status(201).json({ partnerId, status: 'applied' });
}

// POST /api/partners -- admin-side "add partner" (Super Admin / Global / Regional Partner Manager)
async function createPartner(req, res) {
  const { companyName, regionId, countryIds, salesTeamSize, existingSisErpExperience, timezone } = req.body;
  if (!companyName || !regionId) return res.status(400).json({ error: 'companyName and regionId are required' });

  if (req.user.roleCode === ROLES.REGIONAL_PARTNER_MANAGER && Number(regionId) !== req.user.regionId) {
    return res.status(403).json({ error: 'You can only add partners into your own region' });
  }

  const partnerId = await createPartnerRecord({
    companyName, regionId, countryIds: Array.isArray(countryIds) ? countryIds : [],
    salesTeamSize, existingSisErpExperience, timezone, actorUserId: req.user.id,
  });
  res.status(201).json({ partnerId, status: 'applied' });
}

// GET /api/partners -- scoped list (Global sees all, Regional sees their region, Partner sees only self)
async function listPartners(req, res) {
  const user = req.user;
  let scopeCol = 'p.region_id';
  let extraWhere = '';
  const params = [];

  if ([ROLES.PARTNER_ADMIN, ROLES.PARTNER_SALES_USER].includes(user.roleCode)) {
    extraWhere = 'AND p.id = ?';
    params.push(user.partnerId);
  }

  const { clause, params: scopeParams } = extraWhere
    ? { clause: '', params: [] }
    : buildScopeClause(user, { regionColumn: scopeCol });

  const [rows] = await pool.query(
    `SELECT p.id, p.company_name, t.id AS tier_id, t.name AS tier, p.status, p.region_id, r.name AS region_name, p.signup_date
     FROM partners p
     JOIN regions r ON r.id = p.region_id
     JOIN tiers t ON t.id = p.tier_id
     WHERE 1=1 ${clause} ${extraWhere}
     ORDER BY p.created_at DESC`,
    [...scopeParams, ...params]
  );
  res.json(rows);
}

// GET /api/partners/:id -- full profile (with countries, docs, history)
async function getPartner(req, res) {
  const user = req.user;
  const partnerId = req.params.id;

  if ([ROLES.PARTNER_ADMIN, ROLES.PARTNER_SALES_USER].includes(user.roleCode) && Number(partnerId) !== user.partnerId) {
    return res.status(403).json({ error: 'Cannot view another partner organisation' });
  }

  const [[partner]] = await pool.query(
    `SELECT p.*, r.name AS region_name, t.name AS tier
     FROM partners p JOIN regions r ON r.id = p.region_id JOIN tiers t ON t.id = p.tier_id WHERE p.id = ?`,
    [partnerId]
  );
  if (!partner) return res.status(404).json({ error: 'Partner not found' });

  if (user.roleCode === ROLES.REGIONAL_PARTNER_MANAGER && partner.region_id !== user.regionId) {
    return res.status(403).json({ error: 'Partner is outside your region' });
  }

  const [countries] = await pool.query(
    `SELECT c.id, c.name FROM partner_countries pc JOIN countries c ON c.id = pc.country_id WHERE pc.partner_id = ?`,
    [partnerId]
  );
  const [documents] = await pool.query(
    'SELECT id, doc_type, label, file_url, uploaded_at FROM partner_documents WHERE partner_id = ? ORDER BY uploaded_at DESC',
    [partnerId]
  );
  const [history] = await pool.query('SELECT event_type, old_value, new_value, note, created_at FROM partner_history WHERE partner_id = ? ORDER BY created_at DESC', [partnerId]);
  const [users] = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, r.code AS role_code, u.status
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.partner_id = ?`,
    [partnerId]
  );

  res.json({ ...partner, countries, documents, history, users });
}

// PATCH /api/partners/:id -- edit core profile fields
async function updatePartner(req, res) {
  const partnerId = req.params.id;
  const { companyName, salesTeamSize, existingSisErpExperience, timezone, countryIds } = req.body;

  const [[partner]] = await pool.query('SELECT id, region_id FROM partners WHERE id = ?', [partnerId]);
  if (!partner) return res.status(404).json({ error: 'Partner not found' });
  if (req.user.roleCode === ROLES.REGIONAL_PARTNER_MANAGER && partner.region_id !== req.user.regionId) {
    return res.status(403).json({ error: 'Partner is outside your region' });
  }

  await pool.query(
    `UPDATE partners SET company_name = COALESCE(?, company_name), sales_team_size = ?,
            existing_sis_erp_experience = ?, timezone = ?
     WHERE id = ?`,
    [companyName, salesTeamSize ?? null, existingSisErpExperience ?? null, timezone ?? null, partnerId]
  );

  if (Array.isArray(countryIds)) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM partner_countries WHERE partner_id = ?', [partnerId]);
      for (const countryId of countryIds) {
        await conn.query('INSERT INTO partner_countries (partner_id, country_id) VALUES (?, ?)', [partnerId, countryId]);
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  res.json({ partnerId: Number(partnerId), updated: true });
}

// PATCH /api/partners/:id/tier -- Regional/Global Partner Manager only (tier change is audited)
async function changeTier(req, res) {
  const { tierId } = req.body;
  const partnerId = req.params.id;
  if (!tierId) return res.status(400).json({ error: 'tierId is required' });

  const [[tier]] = await pool.query('SELECT id, name FROM tiers WHERE id = ?', [tierId]);
  if (!tier) return res.status(400).json({ error: 'Unknown tierId' });

  const [[partner]] = await pool.query(
    'SELECT p.id, p.region_id, t.name AS tier_name FROM partners p JOIN tiers t ON t.id = p.tier_id WHERE p.id = ?',
    [partnerId]
  );
  if (!partner) return res.status(404).json({ error: 'Partner not found' });

  if (req.user.roleCode === ROLES.REGIONAL_PARTNER_MANAGER && partner.region_id !== req.user.regionId) {
    return res.status(403).json({ error: 'Partner is outside your region' });
  }

  await pool.query('UPDATE partners SET tier_id = ? WHERE id = ?', [tierId, partnerId]);
  await pool.query(
    `INSERT INTO partner_history (partner_id, event_type, old_value, new_value, changed_by, note)
     VALUES (?, 'tier_change', ?, ?, ?, 'Tier updated via portal')`,
    [partnerId, partner.tier_name, tier.name, req.user.id]
  );
  await pool.query(
    `INSERT INTO access_audit_log (user_id, action, entity_type, entity_id, metadata_json)
     VALUES (?, 'TIER_CHANGE', 'partner', ?, JSON_OBJECT('old', ?, 'new', ?))`,
    [req.user.id, partnerId, partner.tier_name, tier.name]
  );

  res.json({ partnerId: Number(partnerId), tier: tier.name });
}

// PATCH /api/partners/:id/status -- approve onboarding / suspend / terminate
async function changeStatus(req, res) {
  const { status } = req.body; // active | on_hold | terminated | under_review
  const partnerId = req.params.id;
  const allowed = ['under_review', 'active', 'on_hold', 'terminated'];
  if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });

  const [[partner]] = await pool.query('SELECT id, status, region_id FROM partners WHERE id = ?', [partnerId]);
  if (!partner) return res.status(404).json({ error: 'Partner not found' });
  if (req.user.roleCode === ROLES.REGIONAL_PARTNER_MANAGER && partner.region_id !== req.user.regionId) {
    return res.status(403).json({ error: 'Partner is outside your region' });
  }

  await pool.query('UPDATE partners SET status = ? WHERE id = ?', [status, partnerId]);
  await pool.query(
    `INSERT INTO partner_history (partner_id, event_type, old_value, new_value, changed_by)
     VALUES (?, 'status_change', ?, ?, ?)`,
    [partnerId, partner.status, status, req.user.id]
  );

  res.json({ partnerId: Number(partnerId), status });
}

// POST /api/partners/:id/users -- user provisioning (invite the first Partner Admin, or let a
// Partner Admin invite their own Partner Sales Users). Emails an activation link instead of
// displaying a temp password on screen.
async function inviteUser(req, res) {
  const partnerId = Number(req.params.id);
  const { email, firstName, lastName, roleCode } = req.body;
  if (!email || !firstName || !lastName || !roleCode) {
    return res.status(400).json({ error: 'email, firstName, lastName and roleCode are required' });
  }
  if (![ROLES.PARTNER_ADMIN, ROLES.PARTNER_SALES_USER].includes(roleCode)) {
    return res.status(400).json({ error: 'roleCode must be PARTNER_ADMIN or PARTNER_SALES_USER' });
  }

  const [[partner]] = await pool.query('SELECT id, region_id, status FROM partners WHERE id = ?', [partnerId]);
  if (!partner) return res.status(404).json({ error: 'Partner not found' });
  if (partner.status !== 'active') {
    return res.status(409).json({ error: 'Partner must be active before inviting users' });
  }

  const user = req.user;
  if (user.roleCode === ROLES.PARTNER_ADMIN) {
    if (user.partnerId !== partnerId) return res.status(403).json({ error: 'Cannot invite users into another partner organisation' });
    if (roleCode !== ROLES.PARTNER_SALES_USER) return res.status(403).json({ error: 'Partner Admins can only invite Partner Sales Users' });
  } else if (user.roleCode === ROLES.REGIONAL_PARTNER_MANAGER) {
    if (partner.region_id !== user.regionId) return res.status(403).json({ error: 'Partner is outside your region' });
    if (roleCode !== ROLES.PARTNER_ADMIN) return res.status(403).json({ error: 'Regional Partner Managers provision the initial Partner Admin only; Partner Admins invite their own Sales Users' });
  } else if (![ROLES.GLOBAL_PARTNER_MANAGER, ROLES.SUPER_ADMIN].includes(user.roleCode)) {
    return res.status(403).json({ error: 'Not authorised to invite users' });
  }

  const [[roleRow]] = await pool.query('SELECT id FROM roles WHERE code = ?', [roleCode]);
  const tempPassword = crypto.randomBytes(24).toString('hex');
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const activationToken = crypto.randomBytes(32).toString('base64url');
  const activationExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  try {
    const [result] = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role_id, partner_id, status, activation_token, activation_token_expires)
       VALUES (?, ?, ?, ?, ?, ?, 'invited', ?, ?)`,
      [email, passwordHash, firstName, lastName, roleRow.id, partnerId, activationToken, activationExpires]
    );
    await pool.query(
      `INSERT INTO access_audit_log (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, 'USER_INVITED', 'user', ?, JSON_OBJECT('partnerId', ?, 'roleCode', ?))`,
      [user.id, result.insertId, partnerId, roleCode]
    );

    const link = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/activate?token=${activationToken}`;
    await sendMail({
      to: email,
      subject: 'Your Academia Partner Portal account',
      html: `<p>Hi ${firstName},</p><p>You've been invited to the Academia Partner Portal.</p>
             <p><a href="${link}">Activate your account and set a password</a> (expires in 7 days).</p>`,
    });

    res.status(201).json({ userId: result.insertId, email, status: 'invited' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A user with this email already exists' });
    throw err;
  }
}

function canManageDocuments(user, partnerId) {
  if ([ROLES.SUPER_ADMIN, ROLES.GLOBAL_PARTNER_MANAGER, ROLES.REGIONAL_PARTNER_MANAGER].includes(user.roleCode)) return true;
  return [ROLES.PARTNER_ADMIN, ROLES.PARTNER_SALES_USER].includes(user.roleCode) && user.partnerId === partnerId;
}

// POST /api/partners/:id/documents -- upload/attach a document (multipart, field name "file")
async function addDocument(req, res) {
  const partnerId = Number(req.params.id);
  const { docType, label } = req.body;
  if (!canManageDocuments(req.user, partnerId)) return res.status(403).json({ error: 'Not authorised to manage this partner\'s documents' });
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  if (!docType) return res.status(400).json({ error: 'docType is required' });

  const fileUrl = `/uploads/documents/${req.file.filename}`;
  const [result] = await pool.query(
    'INSERT INTO partner_documents (partner_id, doc_type, label, file_url, uploaded_by) VALUES (?, ?, ?, ?, ?)',
    [partnerId, docType, label || null, fileUrl, req.user.id]
  );
  res.status(201).json({ id: result.insertId, fileUrl });
}

// PATCH /api/partners/:partnerId/documents/:docId -- replace the file and/or relabel
async function updateDocument(req, res) {
  const { docId } = req.params;
  const { docType, label } = req.body;

  const partnerId = Number(req.params.id);
  if (!canManageDocuments(req.user, partnerId)) return res.status(403).json({ error: 'Not authorised to manage this partner\'s documents' });
  const [[doc]] = await pool.query('SELECT id, partner_id FROM partner_documents WHERE id = ?', [docId]);
  if (!doc || doc.partner_id !== partnerId) return res.status(404).json({ error: 'Document not found' });

  const fileUrl = req.file ? `/uploads/documents/${req.file.filename}` : null;
  await pool.query(
    `UPDATE partner_documents SET doc_type = COALESCE(?, doc_type), label = COALESCE(?, label), file_url = COALESCE(?, file_url) WHERE id = ?`,
    [docType || null, label || null, fileUrl, docId]
  );
  res.json({ id: Number(docId), updated: true });
}

// DELETE /api/partners/:id/documents/:docId
async function deleteDocument(req, res) {
  const { docId } = req.params;
  const partnerId = Number(req.params.id);
  if (!canManageDocuments(req.user, partnerId)) return res.status(403).json({ error: 'Not authorised to manage this partner\'s documents' });
  const [[doc]] = await pool.query('SELECT id, partner_id FROM partner_documents WHERE id = ?', [docId]);
  if (!doc || doc.partner_id !== partnerId) return res.status(404).json({ error: 'Document not found' });
  await pool.query('DELETE FROM partner_documents WHERE id = ?', [docId]);
  res.json({ id: Number(docId), deleted: true });
}

// GET /api/partners/:id/tier-eligibility -- compares actuals against the tier master's criteria.
// Tier changes stay a manual RPM/GPM decision (see changeTier) — this only surfaces the suggestion.
async function tierEligibility(req, res) {
  const partnerId = Number(req.params.id);
  const [[partner]] = await pool.query(
    'SELECT p.id, p.region_id, t.id AS tier_id, t.rank_order AS tier_rank, t.name AS tier_name FROM partners p JOIN tiers t ON t.id = p.tier_id WHERE p.id = ?',
    [partnerId]
  );
  if (!partner) return res.status(404).json({ error: 'Partner not found' });

  if (req.user.roleCode === ROLES.REGIONAL_PARTNER_MANAGER && partner.region_id !== req.user.regionId) {
    return res.status(403).json({ error: 'Partner is outside your region' });
  }
  if ([ROLES.PARTNER_ADMIN, ROLES.PARTNER_SALES_USER].includes(req.user.roleCode) && req.user.partnerId !== partnerId) {
    return res.status(403).json({ error: 'Cannot view another partner organisation' });
  }

  const [[dealsWonRow]] = await pool.query("SELECT COUNT(*) AS deals_won FROM deals WHERE partner_id = ? AND win_loss = 'won'", [partnerId]);
  const [[certRow]] = await pool.query(
    `SELECT COUNT(*) AS certifications
     FROM certification_records cr
     JOIN batch_enrollments be ON be.id = cr.batch_enrollment_id
     JOIN users u ON u.id = be.user_id
     WHERE u.partner_id = ?`,
    [partnerId]
  );
  const [tiers] = await pool.query('SELECT id, name, rank_order AS `rank`, min_deals_won, min_certifications FROM tiers ORDER BY rank_order');

  const actuals = { dealsWon: dealsWonRow.deals_won, certifications: certRow.certifications };
  let highestEligible = tiers[0];
  for (const t of tiers) {
    if (actuals.dealsWon >= t.min_deals_won && actuals.certifications >= t.min_certifications) {
      if (t.rank > highestEligible.rank) highestEligible = t;
    }
  }

  res.json({
    partnerId,
    currentTier: partner.tier_name,
    actuals,
    suggestedTier: highestEligible.name,
    suggestedTierId: highestEligible.id,
    upgradeAvailable: highestEligible.rank > partner.tier_rank,
  });
}

module.exports = {
  applyAsPartner, createPartner, listPartners, getPartner, updatePartner,
  changeTier, changeStatus, inviteUser, tierEligibility,
  addDocument, updateDocument, deleteDocument,
};
