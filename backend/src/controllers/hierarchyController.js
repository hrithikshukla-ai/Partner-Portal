const pool = require('../config/db');
const { ROLES } = require('../utils/roles');

// GET /api/regions -- everyone can list (needed for dropdowns), data itself isn't sensitive
async function listRegions(req, res) {
  const [rows] = await pool.query('SELECT id, name, code FROM regions ORDER BY name');
  res.json(rows);
}

// POST /api/regions -- Super Admin / Global Partner Manager only
async function createRegion(req, res) {
  const { name, code } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'name and code are required' });
  try {
    const [result] = await pool.query('INSERT INTO regions (name, code) VALUES (?, ?)', [name, code]);
    res.status(201).json({ id: result.insertId, name, code });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A region with this name or code already exists' });
    throw err;
  }
}

// PATCH /api/regions/:id
async function updateRegion(req, res) {
  const { name, code } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'name and code are required' });
  const [[region]] = await pool.query('SELECT id FROM regions WHERE id = ?', [req.params.id]);
  if (!region) return res.status(404).json({ error: 'Region not found' });
  try {
    await pool.query('UPDATE regions SET name = ?, code = ? WHERE id = ?', [name, code, req.params.id]);
    res.json({ id: Number(req.params.id), name, code });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A region with this name or code already exists' });
    throw err;
  }
}

// DELETE /api/regions/:id -- blocked if the region has any dependent records
async function deleteRegion(req, res) {
  const id = req.params.id;
  const [[region]] = await pool.query('SELECT id FROM regions WHERE id = ?', [id]);
  if (!region) return res.status(404).json({ error: 'Region not found' });

  const checks = await Promise.all([
    pool.query('SELECT COUNT(*) AS n FROM countries WHERE region_id = ?', [id]),
    pool.query('SELECT COUNT(*) AS n FROM partners WHERE region_id = ?', [id]),
    pool.query('SELECT COUNT(*) AS n FROM institutes WHERE region_id = ?', [id]),
    pool.query('SELECT COUNT(*) AS n FROM users WHERE region_id = ?', [id]),
  ]);
  const [countries, partners, institutes, users] = checks.map(([rows]) => rows[0].n);
  if (countries || partners || institutes || users) {
    return res.status(409).json({
      error: 'This region has countries, partners, target accounts or users mapped to it and cannot be deleted.',
      dependents: { countries, partners, institutes, users },
    });
  }

  await pool.query('DELETE FROM regions WHERE id = ?', [id]);
  res.json({ id: Number(id), deleted: true });
}

// GET /api/regions/:id/countries
async function listCountries(req, res) {
  const [rows] = await pool.query(
    'SELECT id, name, iso_code, dialing_code, notes FROM countries WHERE region_id = ? ORDER BY name',
    [req.params.id]
  );
  res.json(rows);
}

// POST /api/regions/:id/countries -- map a country into a region
async function addCountry(req, res) {
  const { name, isoCode, dialingCode, notes } = req.body;
  if (!name || !isoCode || !dialingCode) return res.status(400).json({ error: 'name, isoCode and dialingCode are required' });
  try {
    const [result] = await pool.query(
      'INSERT INTO countries (region_id, name, iso_code, dialing_code, notes) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, name, isoCode, dialingCode, notes || null]
    );
    res.status(201).json({ id: result.insertId, name, isoCode, dialingCode });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This ISO code is already used in this region' });
    throw err;
  }
}

// PATCH /api/countries/:id
async function updateCountry(req, res) {
  const { name, isoCode, dialingCode, notes } = req.body;
  const [[country]] = await pool.query('SELECT id FROM countries WHERE id = ?', [req.params.id]);
  if (!country) return res.status(404).json({ error: 'Country not found' });
  try {
    await pool.query(
      `UPDATE countries SET name = COALESCE(?, name), iso_code = COALESCE(?, iso_code),
              dialing_code = COALESCE(?, dialing_code), notes = ?
       WHERE id = ?`,
      [name, isoCode, dialingCode, notes ?? null, req.params.id]
    );
    res.json({ id: Number(req.params.id), updated: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This ISO code is already used in this region' });
    throw err;
  }
}

// DELETE /api/countries/:id -- blocked if the country has any dependent records
async function deleteCountry(req, res) {
  const id = req.params.id;
  const [[country]] = await pool.query('SELECT id FROM countries WHERE id = ?', [id]);
  if (!country) return res.status(404).json({ error: 'Country not found' });

  const checks = await Promise.all([
    pool.query('SELECT COUNT(*) AS n FROM partner_countries WHERE country_id = ?', [id]),
    pool.query('SELECT COUNT(*) AS n FROM institutes WHERE country_id = ?', [id]),
    pool.query('SELECT COUNT(*) AS n FROM collateral_assets WHERE country_id = ?', [id]),
  ]);
  const [partners, institutes, collateral] = checks.map(([rows]) => rows[0].n);
  if (partners || institutes || collateral) {
    return res.status(409).json({
      error: 'This country has partners, target accounts or collateral mapped to it and cannot be deleted.',
      dependents: { partners, institutes, collateral },
    });
  }

  await pool.query('DELETE FROM countries WHERE id = ?', [id]);
  res.json({ id: Number(id), deleted: true });
}

// POST /api/regions/:id/assign-manager -- assign a Regional Partner Manager
async function assignRegionalManager(req, res) {
  const { userId } = req.body;
  const regionId = req.params.id;
  const [[user]] = await pool.query('SELECT u.id, r.code AS role_code FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?', [userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role_code !== ROLES.REGIONAL_PARTNER_MANAGER) {
    return res.status(400).json({ error: 'User must have the REGIONAL_PARTNER_MANAGER role' });
  }
  await pool.query('UPDATE users SET region_id = ? WHERE id = ?', [regionId, userId]);
  await pool.query(
    `INSERT INTO access_audit_log (user_id, action, entity_type, entity_id) VALUES (?, 'ASSIGN_REGIONAL_MANAGER', 'region', ?)`,
    [req.user.id, regionId]
  );
  res.json({ userId, regionId: Number(regionId) });
}

// ------------------------------------------------------------
// Tier master (Add / Modify / Delete)
// ------------------------------------------------------------

// GET /api/tiers -- everyone can list (needed for dropdowns)
async function listTiers(req, res) {
  const [rows] = await pool.query(
    'SELECT id, name, rank_order AS `rank`, min_deals_won, min_certifications, collateral_access, mdf_eligible FROM tiers ORDER BY rank_order'
  );
  res.json(rows);
}

// POST /api/tiers
async function createTier(req, res) {
  const { name, rank, minDealsWon, minCertifications, collateralAccess, mdfEligible } = req.body;
  if (!name || rank == null) return res.status(400).json({ error: 'name and rank are required' });
  try {
    const [result] = await pool.query(
      `INSERT INTO tiers (name, rank_order, min_deals_won, min_certifications, collateral_access, mdf_eligible)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, rank, minDealsWon || 0, minCertifications || 0, collateralAccess || 'standard', !!mdfEligible]
    );
    res.status(201).json({ id: result.insertId, name });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A tier with this name or rank already exists' });
    throw err;
  }
}

// PATCH /api/tiers/:id
async function updateTier(req, res) {
  const { name, rank, minDealsWon, minCertifications, collateralAccess, mdfEligible } = req.body;
  const [[tier]] = await pool.query('SELECT id FROM tiers WHERE id = ?', [req.params.id]);
  if (!tier) return res.status(404).json({ error: 'Tier not found' });
  try {
    await pool.query(
      `UPDATE tiers SET name = COALESCE(?, name), rank_order = COALESCE(?, rank_order),
              min_deals_won = COALESCE(?, min_deals_won), min_certifications = COALESCE(?, min_certifications),
              collateral_access = COALESCE(?, collateral_access), mdf_eligible = COALESCE(?, mdf_eligible)
       WHERE id = ?`,
      [name, rank, minDealsWon, minCertifications, collateralAccess, mdfEligible, req.params.id]
    );
    res.json({ id: Number(req.params.id), updated: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A tier with this name or rank already exists' });
    throw err;
  }
}

// DELETE /api/tiers/:id -- blocked while any partner or collateral asset still uses it
async function deleteTier(req, res) {
  const id = req.params.id;
  const [[tier]] = await pool.query('SELECT id FROM tiers WHERE id = ?', [id]);
  if (!tier) return res.status(404).json({ error: 'Tier not found' });

  const checks = await Promise.all([
    pool.query('SELECT COUNT(*) AS n FROM partners WHERE tier_id = ?', [id]),
    pool.query('SELECT COUNT(*) AS n FROM collateral_assets WHERE min_tier_id = ?', [id]),
  ]);
  const [partners, collateral] = checks.map(([rows]) => rows[0].n);
  if (partners || collateral) {
    return res.status(409).json({
      error: 'This tier is in use by partners or collateral assets and cannot be deleted.',
      dependents: { partners, collateral },
    });
  }

  await pool.query('DELETE FROM tiers WHERE id = ?', [id]);
  res.json({ id: Number(id), deleted: true });
}

module.exports = {
  listRegions, createRegion, updateRegion, deleteRegion,
  listCountries, addCountry, updateCountry, deleteCountry,
  assignRegionalManager,
  listTiers, createTier, updateTier, deleteTier,
};
