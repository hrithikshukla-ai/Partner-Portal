const pool = require('../config/db');
const { ROLES } = require('../utils/roles');

async function tierRank(tierId) {
  const [[row]] = await pool.query('SELECT rank_order FROM tiers WHERE id = ?', [tierId]);
  return row ? row.rank_order : 0;
}

// POST /api/collateral -- create a draft asset (Academia Marketing / Global Partner Manager)
async function createAsset(req, res) {
  const { title, contentType, regionId, countryId, language, minTierId } = req.body;
  if (!title || !contentType) return res.status(400).json({ error: 'title and contentType are required' });

  if (req.user.roleCode === ROLES.ACADEMIA_MARKETING && regionId && regionId !== req.user.regionId) {
    return res.status(403).json({ error: 'You can only publish collateral for your assigned region' });
  }

  let tierId = minTierId;
  if (!tierId) {
    const [[lowest]] = await pool.query('SELECT id FROM tiers ORDER BY rank_order ASC LIMIT 1');
    tierId = lowest.id;
  }

  const [result] = await pool.query(
    `INSERT INTO collateral_assets (title, content_type, region_id, country_id, language, min_tier_id, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`,
    [title, contentType, regionId || null, countryId || null, language || 'en', tierId, req.user.id]
  );
  res.status(201).json({ id: result.insertId, status: 'draft' });
}

// POST /api/collateral/:id/versions -- upload a new version; latest becomes "approved" on publish
async function addVersion(req, res) {
  const { fileUrl } = req.body;
  if (!fileUrl) return res.status(400).json({ error: 'fileUrl is required' });
  const assetId = req.params.id;

  const [[{ maxVersion }]] = await pool.query(
    'SELECT COALESCE(MAX(version_no), 0) AS maxVersion FROM collateral_versions WHERE asset_id = ?',
    [assetId]
  );
  const versionNo = maxVersion + 1;

  const [result] = await pool.query(
    'INSERT INTO collateral_versions (asset_id, version_no, file_url, uploaded_by) VALUES (?, ?, ?, ?)',
    [assetId, versionNo, fileUrl, req.user.id]
  );
  res.status(201).json({ id: result.insertId, versionNo });
}

// PATCH /api/collateral/:id/publish -- marks a specific version as the single latest-approved
async function publishVersion(req, res) {
  const { versionId } = req.body;
  const assetId = req.params.id;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE collateral_versions SET is_latest_approved = FALSE WHERE asset_id = ?', [assetId]);
    await conn.query('UPDATE collateral_versions SET is_latest_approved = TRUE WHERE id = ? AND asset_id = ?', [versionId, assetId]);
    await conn.query(`UPDATE collateral_assets SET status='published', latest_version_id = ? WHERE id = ?`, [versionId, assetId]);
    await conn.query(
      `INSERT INTO access_audit_log (user_id, action, entity_type, entity_id) VALUES (?, 'COLLATERAL_PUBLISH', 'collateral_asset', ?)`,
      [req.user.id, assetId]
    );
    await conn.commit();
    res.json({ assetId: Number(assetId), latestVersionId: versionId, status: 'published' });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// GET /api/collateral -- scoped by region/country + gated by the requesting partner's tier
async function listAssets(req, res) {
  const user = req.user;
  let partnerTierRank = null;
  let partnerRegionId = null;

  if ([ROLES.PARTNER_ADMIN, ROLES.PARTNER_SALES_USER].includes(user.roleCode)) {
    const [[partner]] = await pool.query(
      'SELECT t.rank_order, p.region_id FROM partners p JOIN tiers t ON t.id = p.tier_id WHERE p.id = ?',
      [user.partnerId]
    );
    partnerTierRank = partner.rank_order;
    partnerRegionId = partner.region_id;
  }

  let where = "ca.status = 'published'";
  const params = [];

  if (partnerRegionId) {
    where += ' AND (ca.region_id IS NULL OR ca.region_id = ?)';
    params.push(partnerRegionId);
  } else if (user.roleCode === ROLES.REGIONAL_PARTNER_MANAGER) {
    where += ' AND (ca.region_id IS NULL OR ca.region_id = ?)';
    params.push(user.regionId);
  }
  // Global/Super Admin: see everything published, no region filter.

  const [rows] = await pool.query(
    `SELECT ca.id, ca.title, ca.content_type, ca.language, t.id AS min_tier_id, t.name AS min_tier, t.rank_order AS min_tier_rank,
            ca.region_id, r.name AS region_name, cv.file_url, cv.version_no
     FROM collateral_assets ca
     LEFT JOIN regions r ON r.id = ca.region_id
     LEFT JOIN collateral_versions cv ON cv.id = ca.latest_version_id
     JOIN tiers t ON t.id = ca.min_tier_id
     WHERE ${where}
     ORDER BY ca.title`,
    params
  );

  const visible = partnerTierRank != null
    ? rows.filter((a) => a.min_tier_rank <= partnerTierRank)
    : rows;

  res.json(visible);
}

// POST /api/collateral/:id/download -- logs usage analytics, then returns the file url
async function downloadAsset(req, res) {
  const assetId = req.params.id;
  const [[asset]] = await pool.query('SELECT id, latest_version_id, min_tier_id, region_id FROM collateral_assets WHERE id = ?', [assetId]);
  if (!asset || !asset.latest_version_id) return res.status(404).json({ error: 'No published version available' });

  if ([ROLES.PARTNER_ADMIN, ROLES.PARTNER_SALES_USER].includes(req.user.roleCode)) {
    const [[partner]] = await pool.query(
      'SELECT t.rank_order, t.name, p.region_id FROM partners p JOIN tiers t ON t.id = p.tier_id WHERE p.id = ?',
      [req.user.partnerId]
    );
    if (asset.region_id && asset.region_id !== partner.region_id) {
      return res.status(403).json({ error: 'This asset is not available in your region' });
    }
    const requiredRank = await tierRank(asset.min_tier_id);
    if (requiredRank > partner.rank_order) {
      const [[requiredTier]] = await pool.query('SELECT name FROM tiers WHERE id = ?', [asset.min_tier_id]);
      return res.status(403).json({ error: `This asset requires ${requiredTier.name} tier or higher` });
    }
  }

  await pool.query(
    'INSERT INTO collateral_downloads (asset_id, version_id, user_id, partner_id) VALUES (?, ?, ?, ?)',
    [assetId, asset.latest_version_id, req.user.id, req.user.partnerId || null]
  );

  const [[version]] = await pool.query('SELECT file_url FROM collateral_versions WHERE id = ?', [asset.latest_version_id]);
  res.json({ fileUrl: version.file_url });
}

// POST /api/collateral/requests -- request-a-custom-asset workflow
async function requestCustomAsset(req, res) {
  const { title, description } = req.body;
  if (!description) return res.status(400).json({ error: 'description is required' });
  const [result] = await pool.query(
    'INSERT INTO custom_asset_requests (partner_id, requested_by, title, description) VALUES (?, ?, ?, ?)',
    [req.user.partnerId, req.user.id, title || null, description]
  );
  res.status(201).json({ id: result.insertId, status: 'open' });
}

// GET /api/collateral/requests -- scoped list
async function listCustomRequests(req, res) {
  const user = req.user;
  let where = '1=1';
  const params = [];
  if ([ROLES.PARTNER_ADMIN, ROLES.PARTNER_SALES_USER].includes(user.roleCode)) {
    where = 'r.partner_id = ?';
    params.push(user.partnerId);
  }
  const [rows] = await pool.query(
    `SELECT r.id, r.title, r.description, r.status, r.created_at, p.company_name, u.first_name, u.last_name
     FROM custom_asset_requests r JOIN partners p ON p.id = r.partner_id JOIN users u ON u.id = r.requested_by
     WHERE ${where} ORDER BY r.created_at DESC`,
    params
  );
  res.json(rows);
}

// PATCH /api/collateral/requests/:id -- Academia Marketing / Global triages the request
async function updateCustomRequestStatus(req, res) {
  const { status } = req.body;
  if (!['open', 'in_progress', 'fulfilled', 'declined'].includes(status)) return res.status(400).json({ error: 'invalid status' });
  await pool.query('UPDATE custom_asset_requests SET status = ? WHERE id = ?', [status, req.params.id]);
  res.json({ id: Number(req.params.id), status });
}

module.exports = {
  createAsset, addVersion, publishVersion, listAssets, downloadAsset,
  requestCustomAsset, listCustomRequests, updateCustomRequestStatus,
};
