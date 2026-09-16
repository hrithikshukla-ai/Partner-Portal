import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Loading, EmptyState, ErrorBanner, Modal, SearchBox, filterRows } from '../components/ui';

const STAGES = ['Discovery Call', 'Demo', 'Commercials Shared', 'Negotiation', 'Won', 'Lost'];
const STAGE_COLORS = {
  'Discovery Call': '#6b7080', Demo: '#B98900', 'Commercials Shared': '#2A2C5B',
  Negotiation: '#B2242E', Won: '#1E7A46', Lost: '#6b7080',
};

function daysLeft(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
}

export default function Deals() {
  const { user } = useAuth();
  const [deals, setDeals] = useState(null);
  const [partners, setPartners] = useState([]);
  const [regions, setRegions] = useState([]);
  const [filters, setFilters] = useState({ partnerId: '', regionId: '' });
  const [query, setQuery] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [instituteId, setInstituteId] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [conflictNotice, setConflictNotice] = useState(null);
  const canApprove = ['SUPER_ADMIN', 'GLOBAL_PARTNER_MANAGER', 'REGIONAL_PARTNER_MANAGER'].includes(user?.role_code);
  const canRegister = ['PARTNER_ADMIN', 'PARTNER_SALES_USER'].includes(user?.role_code);

  function load() {
    const params = {};
    if (filters.partnerId) params.partnerId = filters.partnerId;
    if (filters.regionId) params.regionId = filters.regionId;
    api.get('/deals', { params }).then((res) => setDeals(res.data));
  }
  useEffect(load, [filters]);
  useEffect(() => {
    api.get('/partners').then((res) => setPartners(res.data)).catch(() => setPartners([]));
    api.get('/regions').then((res) => setRegions(res.data));
  }, []);

  async function registerDeal(e) {
    e.preventDefault();
    setConflictNotice(null);
    const res = await api.post('/deals', { instituteId: Number(instituteId), dealValueUsd: dealValue ? Number(dealValue) : undefined });
    if (res.data.conflict?.status === 'conflict') {
      setConflictNotice(res.data.conflict.message);
    } else {
      setShowRegister(false);
    }
    setInstituteId('');
    setDealValue('');
    load();
  }

  async function approve(id, decision) {
    try {
      await api.patch(`/deals/${id}/approve`, { decision });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not process approval');
    }
  }

  async function moveStage(id, stageName) {
    const stageIndex = STAGES.indexOf(stageName) + 1;
    await api.patch(`/deals/${id}/stage`, { stageId: stageIndex });
    load();
  }

  if (!deals) return <Loading />;

  const searched = filterRows(deals, query, ['institute_name', 'partner_name']);
  const byStage = STAGES.reduce((acc, s) => ({ ...acc, [s]: searched.filter((d) => d.stage_name === s) }), {});

  return (
    <div>
      <PageHeader
        title="Deals & Pipeline"
        subtitle="Governed deal registration with automated conflict protection — the core of the channel program."
        action={canRegister && <button className="btn btn-primary" onClick={() => setShowRegister(true)}>Register a deal</button>}
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <SearchBox value={query} onChange={setQuery} placeholder="Search by institute or partner…" />
        <select style={{ width: 180 }} value={filters.partnerId} onChange={(e) => setFilters({ ...filters, partnerId: e.target.value })}>
          <option value="">All partners</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.company_name}</option>)}
        </select>
        <select style={{ width: 160 }} value={filters.regionId} onChange={(e) => setFilters({ ...filters, regionId: e.target.value })}>
          <option value="">All regions</option>
          {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

      {deals.length === 0 ? <EmptyState text="No deals registered yet." /> : (
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8 }}>
          {STAGES.map((stage) => (
            <div key={stage} style={{ minWidth: 260, flex: '0 0 260px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: STAGE_COLORS[stage] }} />
                <h3 style={{ margin: 0 }}>{stage}</h3>
                <span style={{ color: 'var(--gray-500)', fontSize: 11 }}>({byStage[stage].length})</span>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {byStage[stage].map((d) => {
                  const left = daysLeft(d.protected_until);
                  return (
                    <div key={d.id} className="card" style={{ padding: 12 }}>
                      <div style={{ fontWeight: 700, marginBottom: 2 }}>{d.institute_name}</div>
                      <div style={{ color: 'var(--gray-500)', marginBottom: 8 }}>{d.partner_name}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {d.deal_value_usd && <span className="badge badge-open">${Number(d.deal_value_usd).toLocaleString()}</span>}
                        <span className={`badge ${d.approval_status === 'approved' ? 'badge-won' : d.approval_status === 'rejected' ? 'badge-lost' : 'badge-open'}`}>{d.approval_status}</span>
                        {d.protected_until && <span className="badge badge-protected">{left >= 0 ? `${left}d protected` : 'expired'}</span>}
                        {d.sla_breached && <span className="badge badge-conflict">SLA breached</span>}
                        <span className={`badge ${d.win_loss === 'won' ? 'badge-won' : d.win_loss === 'lost' ? 'badge-lost' : 'badge-open'}`}>{d.win_loss}</span>
                      </div>
                      {(canRegister || canApprove) && (
                        <select value={d.stage_name} onChange={(e) => moveStage(d.id, e.target.value)} style={{ marginBottom: 6 }}>
                          {STAGES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      )}
                      {canApprove && d.approval_status === 'pending' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-primary" style={{ padding: '4px 8px', flex: 1 }} onClick={() => approve(d.id, 'approved')}>Approve</button>
                          <button className="btn btn-outline" style={{ padding: '4px 8px', flex: 1 }} onClick={() => approve(d.id, 'rejected')}>Reject</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {byStage[stage].length === 0 && <div style={{ color: 'var(--gray-500)', fontSize: 11 }}>No deals in this stage.</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showRegister && (
        <Modal title="Register a deal" onClose={() => setShowRegister(false)}>
          <form onSubmit={registerDeal} style={{ display: 'grid', gap: 10 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Institute ID</label>
              <input value={instituteId} onChange={(e) => setInstituteId(e.target.value)} placeholder="e.g. 14 — find it on the Target Accounts screen" required />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Deal value (USD)</label>
              <input value={dealValue} onChange={(e) => setDealValue(e.target.value)} placeholder="e.g. 25000" />
            </div>
            <button className="btn btn-primary" type="submit" style={{ justifySelf: 'start' }}>Register &amp; run conflict check</button>
            <ErrorBanner text={conflictNotice} />
          </form>
        </Modal>
      )}
    </div>
  );
}
