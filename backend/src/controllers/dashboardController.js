const pool = require('../config/db');
const { ROLES } = require('../utils/roles');

// GET /api/dashboards/partner -- "my pipeline value, deals won, cadence compliance, collateral usage"
async function partnerDashboard(req, res) {
  const partnerId = req.user.partnerId;
  if (!partnerId) return res.status(400).json({ error: 'No partner context for this user' });

  const [[pipeline]] = await pool.query(
    `SELECT COUNT(*) AS open_deals, COALESCE(SUM(deal_value_usd),0) AS pipeline_value_usd
     FROM deals WHERE partner_id = ? AND win_loss = 'open'`,
    [partnerId]
  );
  const [[won]] = await pool.query(`SELECT COUNT(*) AS deals_won, COALESCE(SUM(deal_value_usd),0) AS won_value_usd FROM deals WHERE partner_id = ? AND win_loss = 'won'`, [partnerId]);
  const [[cadence]] = await pool.query(
    `SELECT COUNT(*) AS total_items, SUM(status='done') AS done_on_time
     FROM mom_action_items mi JOIN cadence_meetings m ON m.id = mi.meeting_id WHERE m.partner_id = ?`,
    [partnerId]
  );
  const [[collateral]] = await pool.query('SELECT COUNT(*) AS downloads FROM collateral_downloads WHERE partner_id = ?', [partnerId]);

  res.json({
    pipeline: { openDeals: pipeline.open_deals, pipelineValueUsd: pipeline.pipeline_value_usd },
    won: { dealsWon: won.deals_won, wonValueUsd: won.won_value_usd },
    cadence: {
      totalActionItems: cadence.total_items,
      onTimeClosureRate: cadence.total_items ? Number(((cadence.done_on_time / cadence.total_items) * 100).toFixed(1)) : null,
    },
    collateral: { totalDownloads: collateral.downloads },
  });
}

// GET /api/dashboards/regional -- Regional Partner Manager roll-up
async function regionalDashboard(req, res) {
  const regionId = req.user.roleCode === ROLES.REGIONAL_PARTNER_MANAGER ? req.user.regionId : req.query.regionId;
  if (!regionId) return res.status(400).json({ error: 'regionId is required' });

  const [[partners]] = await pool.query(`SELECT COUNT(*) AS total_partners, SUM(status='active') AS active_partners FROM partners WHERE region_id = ?`, [regionId]);
  const [[pipeline]] = await pool.query(
    `SELECT COUNT(*) AS open_deals, COALESCE(SUM(d.deal_value_usd),0) AS pipeline_value_usd
     FROM deals d JOIN institutes i ON i.id = d.institute_id WHERE i.region_id = ? AND d.win_loss='open'`,
    [regionId]
  );
  const [[winRate]] = await pool.query(
    `SELECT SUM(d.win_loss='won') AS won, SUM(d.win_loss IN ('won','lost')) AS closed
     FROM deals d JOIN institutes i ON i.id = d.institute_id WHERE i.region_id = ?`,
    [regionId]
  );

  res.json({
    partners: { total: partners.total_partners, active: partners.active_partners },
    pipeline: { openDeals: pipeline.open_deals, pipelineValueUsd: pipeline.pipeline_value_usd },
    winRatePct: winRate.closed ? Number(((winRate.won / winRate.closed) * 100).toFixed(1)) : null,
  });
}

// GET /api/dashboards/global -- Director's live SQL / pipeline / win-rate vs. business plan
async function globalDashboard(req, res) {
  const [targets] = await pool.query(
    `SELECT bp.region_id, r.name AS region_name, bp.fiscal_year, bp.sql_target, bp.pipeline_value_target_usd, bp.win_rate_target_pct
     FROM business_plan_targets bp JOIN regions r ON r.id = bp.region_id WHERE bp.fiscal_year = YEAR(CURDATE())`
  );
  const [actuals] = await pool.query(
    `SELECT i.region_id, COUNT(*) AS open_deals, COALESCE(SUM(d.deal_value_usd),0) AS pipeline_value_usd,
            SUM(d.win_loss='won') AS won, SUM(d.win_loss IN ('won','lost')) AS closed
     FROM deals d JOIN institutes i ON i.id = d.institute_id
     GROUP BY i.region_id`
  );
  const actualsByRegion = Object.fromEntries(actuals.map((a) => [a.region_id, a]));

  const rollup = targets.map((t) => {
    const a = actualsByRegion[t.region_id] || { open_deals: 0, pipeline_value_usd: 0, won: 0, closed: 0 };
    return {
      regionId: t.region_id,
      regionName: t.region_name,
      sqlTarget: t.sql_target,
      pipelineValueTargetUsd: t.pipeline_value_target_usd,
      pipelineValueActualUsd: a.pipeline_value_usd,
      winRateTargetPct: t.win_rate_target_pct,
      winRateActualPct: a.closed ? Number(((a.won / a.closed) * 100).toFixed(1)) : null,
    };
  });

  res.json(rollup);
}

// POST /api/dashboards/business-plan -- set annual targets per region
async function setBusinessPlanTarget(req, res) {
  const { regionId, fiscalYear, sqlTarget, pipelineValueTargetUsd, winRateTargetPct } = req.body;
  if (!regionId || !fiscalYear || sqlTarget == null || pipelineValueTargetUsd == null || winRateTargetPct == null) {
    return res.status(400).json({ error: 'regionId, fiscalYear, sqlTarget, pipelineValueTargetUsd, winRateTargetPct are required' });
  }
  await pool.query(
    `INSERT INTO business_plan_targets (region_id, fiscal_year, sql_target, pipeline_value_target_usd, win_rate_target_pct, created_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE sql_target=VALUES(sql_target), pipeline_value_target_usd=VALUES(pipeline_value_target_usd),
       win_rate_target_pct=VALUES(win_rate_target_pct)`,
    [regionId, fiscalYear, sqlTarget, pipelineValueTargetUsd, winRateTargetPct, req.user.id]
  );
  res.status(201).json({ regionId, fiscalYear });
}

module.exports = { partnerDashboard, regionalDashboard, globalDashboard, setBusinessPlanTarget };
