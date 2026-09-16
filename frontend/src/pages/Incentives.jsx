import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Loading, EmptyState, SearchBox, filterRows } from '../components/ui';

export default function Incentives() {
  const { user } = useAuth();
  const [mdf, setMdf] = useState(null);
  const [commissions, setCommissions] = useState(null);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ activityDescription: '', requestedAmountUsd: '' });
  const canRequest = ['PARTNER_ADMIN', 'PARTNER_SALES_USER'].includes(user?.role_code);
  const canDecide = ['SUPER_ADMIN', 'GLOBAL_PARTNER_MANAGER', 'REGIONAL_PARTNER_MANAGER'].includes(user?.role_code);

  function load() {
    api.get('/incentives/mdf').then((res) => setMdf(res.data));
    api.get('/incentives/commissions').then((res) => setCommissions(res.data));
  }
  useEffect(load, []);

  async function submitRequest(e) {
    e.preventDefault();
    if (!form.activityDescription || !form.requestedAmountUsd) return;
    await api.post('/incentives/mdf', { ...form, requestedAmountUsd: Number(form.requestedAmountUsd) });
    setForm({ activityDescription: '', requestedAmountUsd: '' });
    load();
  }

  async function decide(id, decision) {
    await api.patch(`/incentives/mdf/${id}/decision`, { decision });
    load();
  }

  if (!mdf || !commissions) return <Loading />;

  return (
    <div>
      <PageHeader title="MDF & Commission Tracking" subtitle="Phase 3 — Market Development Fund requests and commission visibility per closed-won deal." />

      {canRequest && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Request MDF</h2>
          <form onSubmit={submitRequest} style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div className="field" style={{ marginBottom: 0, flex: 2 }}>
              <label>Activity description</label>
              <input value={form.activityDescription} onChange={(e) => setForm({ ...form, activityDescription: e.target.value })} placeholder="e.g. Regional roadshow co-marketing" />
            </div>
            <div className="field" style={{ marginBottom: 0, width: 160 }}>
              <label>Requested amount (USD)</label>
              <input value={form.requestedAmountUsd} onChange={(e) => setForm({ ...form, requestedAmountUsd: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit">Submit</button>
          </form>
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <SearchBox value={query} onChange={setQuery} placeholder="Search MDF requests…" />
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <div style={{ padding: '14px 16px 0' }}><h2>MDF requests</h2></div>
        {mdf.length === 0 ? <div style={{ padding: 16, color: 'var(--gray-500)' }}>No MDF requests yet.</div> : (
          <table>
            <thead><tr><th>Partner</th><th>Activity</th><th>Requested</th><th>Approved</th><th>Status</th>{canDecide && <th></th>}</tr></thead>
            <tbody>
              {filterRows(mdf, query, ['company_name', 'activity_description', 'status']).map((m) => (
                <tr key={m.id}>
                  <td>{m.company_name}</td>
                  <td>{m.activity_description}</td>
                  <td>${Number(m.requested_amount_usd).toLocaleString()}</td>
                  <td>{m.approved_amount_usd ? `$${Number(m.approved_amount_usd).toLocaleString()}` : '—'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{m.status}</td>
                  {canDecide && (
                    <td>
                      {m.status === 'submitted' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-primary" style={{ padding: '4px 8px' }} onClick={() => decide(m.id, 'approved')}>Approve</button>
                          <button className="btn btn-outline" style={{ padding: '4px 8px' }} onClick={() => decide(m.id, 'rejected')}>Reject</button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '14px 16px 0' }}>
          <h2>Commission visibility</h2>
          <p style={{ color: 'var(--gray-500)', marginBottom: 12 }}>Actual payout automation depends on finance/ERP readiness (BRD Section 4.2) — this view is visibility-only for now.</p>
        </div>
        {commissions.length === 0 ? <EmptyState text="No commission records yet." /> : (
          <table>
            <thead><tr><th>Partner</th><th>Deal ID</th><th>Rate</th><th>Amount</th><th>Payout status</th></tr></thead>
            <tbody>
              {commissions.map((c) => (
                <tr key={c.id}>
                  <td>{c.company_name}</td>
                  <td>#{c.deal_id}</td>
                  <td>{c.commission_pct}%</td>
                  <td>${Number(c.commission_amount_usd).toLocaleString()}</td>
                  <td style={{ textTransform: 'capitalize' }}>{c.payout_status.replace('_', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
