import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Loading, EmptyState, SearchBox, filterRows } from '../components/ui';

export default function Notifications() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [query, setQuery] = useState('');
  const [broadcast, setBroadcast] = useState({ title: '', body: '', targetMode: 'all', targetRegionId: '', targetPartnerId: '', targetUserId: '' });
  const [regions, setRegions] = useState([]);
  const [partners, setPartners] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [sent, setSent] = useState('');
  const canBroadcast = ['SUPER_ADMIN', 'GLOBAL_PARTNER_MANAGER', 'REGIONAL_PARTNER_MANAGER'].includes(user?.role_code);

  function load() { api.get('/notifications').then((res) => setItems(res.data)); }
  useEffect(load, []);
  useEffect(() => {
    if (!canBroadcast) return;
    api.get('/regions').then((res) => setRegions(res.data));
    api.get('/partners').then((res) => setPartners(res.data)).catch(() => setPartners([]));
    api.get('/users').then((res) => setPersonnel(res.data.filter((u) => ['PARTNER_ADMIN', 'PARTNER_SALES_USER'].includes(u.role_code)))).catch(() => setPersonnel([]));
  }, [canBroadcast]);

  async function markRead(id) {
    await api.patch(`/notifications/${id}/read`);
    load();
  }

  async function sendBroadcast(e) {
    e.preventDefault();
    if (!broadcast.title || !broadcast.body) return;
    await api.post('/notifications/broadcast', broadcast);
    setSent('Sent.');
    setBroadcast({ title: '', body: '', targetMode: 'all', targetRegionId: '', targetPartnerId: '', targetUserId: '' });
    setTimeout(() => setSent(''), 2000);
  }

  if (!items) return <Loading />;
  const filtered = filterRows(items, query, ['title', 'body']);

  return (
    <div>
      <PageHeader title="Notification Centre" subtitle="Deal status changes, collateral updates, cadence reminders, and onboarding milestones — in one place." />

      <div style={{ marginBottom: 14 }}>
        <SearchBox value={query} onChange={setQuery} placeholder="Search notifications…" />
      </div>

      {filtered.length === 0 ? <EmptyState text="You're all caught up." /> : (
        <div className="card" style={{ padding: 0, marginBottom: 16 }}>
          {filtered.map((n) => (
            <div key={n.id} style={{ padding: 14, borderBottom: '1px solid var(--gray-200)', display: 'flex', justifyContent: 'space-between', gap: 12, background: n.is_read ? 'transparent' : 'var(--navy-100)' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{n.title}</div>
                <div style={{ color: 'var(--gray-500)' }}>{n.body}</div>
                <div style={{ fontSize: 10, color: 'var(--gray-500)', marginTop: 4 }}>{new Date(n.sent_at).toLocaleString()}</div>
              </div>
              {!n.is_read && <button className="btn btn-outline" style={{ height: 30 }} onClick={() => markRead(n.id)}>Mark read</button>}
            </div>
          ))}
        </div>
      )}

      {canBroadcast && (
        <div className="card">
          <h2>Broadcast an announcement</h2>
          <form onSubmit={sendBroadcast} style={{ display: 'grid', gap: 10 }}>
            <input placeholder="Title" value={broadcast.title} onChange={(e) => setBroadcast({ ...broadcast, title: e.target.value })} />
            <textarea placeholder="Message" rows={3} value={broadcast.body} onChange={(e) => setBroadcast({ ...broadcast, body: e.target.value })} />

            <div>
              <label>Send to</label>
              <select value={broadcast.targetMode} onChange={(e) => setBroadcast({ ...broadcast, targetMode: e.target.value, targetRegionId: '', targetPartnerId: '', targetUserId: '' })}>
                <option value="all">All partners</option>
                <option value="region">By region (Regional Partner)</option>
                <option value="partner">A specific partner</option>
                <option value="user">A specific partner personnel</option>
              </select>
            </div>

            {broadcast.targetMode === 'region' && (
              <select value={broadcast.targetRegionId} onChange={(e) => setBroadcast({ ...broadcast, targetRegionId: e.target.value })} required>
                <option value="">Select region</option>
                {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
            {broadcast.targetMode === 'partner' && (
              <select value={broadcast.targetPartnerId} onChange={(e) => setBroadcast({ ...broadcast, targetPartnerId: e.target.value })} required>
                <option value="">Select partner</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.company_name}</option>)}
              </select>
            )}
            {broadcast.targetMode === 'user' && (
              <select value={broadcast.targetUserId} onChange={(e) => setBroadcast({ ...broadcast, targetUserId: e.target.value })} required>
                <option value="">Select partner personnel</option>
                {personnel.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name} — {p.partner_name}</option>)}
              </select>
            )}

            <button className="btn btn-primary" type="submit" style={{ justifySelf: 'start' }}>Send</button>
            {sent && <span className="badge badge-won" style={{ justifySelf: 'start', padding: '6px 10px' }}>{sent}</span>}
          </form>
        </div>
      )}
    </div>
  );
}
