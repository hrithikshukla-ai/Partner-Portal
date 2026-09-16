import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, StatCard, StatRow, Loading } from '../components/ui';

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const endpoint = ['PARTNER_ADMIN', 'PARTNER_SALES_USER'].includes(user?.role_code)
      ? '/dashboards/partner'
      : ['GLOBAL_PARTNER_MANAGER', 'SUPER_ADMIN'].includes(user?.role_code)
      ? '/dashboards/global'
      : '/dashboards/regional';

    api.get(endpoint)
      .then((res) => setData({ endpoint, payload: res.data }))
      .catch(() => setData({ endpoint, payload: null }))
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user?.first_name || ''} ${user?.last_name || ''}`.trim()}
        subtitle="Live view of pipeline, cadence, and collateral — replacing the old spreadsheet tracker."
      />

      {data?.endpoint === '/dashboards/partner' && data.payload && (
        <>
          <StatRow>
            <StatCard label="Open pipeline value" value={`$${Number(data.payload.pipeline.pipelineValueUsd).toLocaleString()}`} sub={`${data.payload.pipeline.openDeals} open deals`} />
            <StatCard label="Deals won" value={data.payload.won.dealsWon} sub={`$${Number(data.payload.won.wonValueUsd).toLocaleString()} closed-won`} />
            <StatCard label="Cadence on-time closure" value={data.payload.cadence.onTimeClosureRate != null ? `${data.payload.cadence.onTimeClosureRate}%` : '—'} sub={`${data.payload.cadence.totalActionItems} MoM action items`} />
            <StatCard label="Collateral downloads" value={data.payload.collateral.totalDownloads} />
          </StatRow>
        </>
      )}

      {data?.endpoint === '/dashboards/regional' && data.payload && (
        <StatRow>
          <StatCard label="Active partners" value={`${data.payload.partners.active} / ${data.payload.partners.total}`} sub="active vs. total in region" />
          <StatCard label="Open pipeline value" value={`$${Number(data.payload.pipeline.pipelineValueUsd).toLocaleString()}`} sub={`${data.payload.pipeline.openDeals} open deals`} />
          <StatCard label="Win rate" value={data.payload.winRatePct != null ? `${data.payload.winRatePct}%` : '—'} />
        </StatRow>
      )}

      {data?.endpoint === '/dashboards/global' && Array.isArray(data.payload) && (
        <div className="card">
          <h2>Regional roll-up vs. business plan</h2>
          <table>
            <thead>
              <tr>
                <th>Region</th><th>SQL target</th><th>Pipeline (actual / target)</th><th>Win rate (actual / target)</th>
              </tr>
            </thead>
            <tbody>
              {data.payload.map((r) => (
                <tr key={r.regionId}>
                  <td>{r.regionName}</td>
                  <td>{r.sqlTarget}</td>
                  <td>${Number(r.pipelineValueActualUsd).toLocaleString()} / ${Number(r.pipelineValueTargetUsd).toLocaleString()}</td>
                  <td>{r.winRateActualPct ?? '—'}% / {r.winRateTargetPct}%</td>
                </tr>
              ))}
              {data.payload.length === 0 && (
                <tr><td colSpan={4} style={{ color: 'var(--gray-500)' }}>No business plan targets set yet for this fiscal year.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!data?.payload && (
        <div className="card" style={{ color: 'var(--gray-500)' }}>
          No data yet — dashboards populate once partners, deals, and cadence activity start flowing through the portal.
        </div>
      )}
    </div>
  );
}
