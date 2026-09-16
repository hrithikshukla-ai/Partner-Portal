import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Loading, EmptyState, SearchBox, filterRows, Modal } from '../components/ui';

const REQUEST_STATUS_CLASS = { open: 'badge-open', in_progress: 'badge-protected', fulfilled: 'badge-won', declined: 'badge-lost' };

export default function Collateral() {
  const { user } = useAuth();
  const [assets, setAssets] = useState(null);
  const [requests, setRequests] = useState([]);
  const [query, setQuery] = useState('');
  const [showRequest, setShowRequest] = useState(false);
  const [requestForm, setRequestForm] = useState({ title: '', description: '' });
  const canPublish = ['SUPER_ADMIN', 'GLOBAL_PARTNER_MANAGER', 'ACADEMIA_MARKETING'].includes(user?.role_code);
  const canRequest = ['PARTNER_ADMIN', 'PARTNER_SALES_USER'].includes(user?.role_code);

  function load() {
    api.get('/collateral').then((res) => setAssets(res.data));
    api.get('/collateral/requests').then((res) => setRequests(res.data)).catch(() => setRequests([]));
  }
  useEffect(load, []);

  async function download(id) {
    try {
      const res = await api.post(`/collateral/${id}/download`);
      window.open(res.data.fileUrl, '_blank');
    } catch (err) {
      alert(err.response?.data?.error || 'Could not download this asset');
    }
  }

  async function submitRequest(e) {
    e.preventDefault();
    if (!requestForm.description.trim()) return;
    await api.post('/collateral/requests', requestForm);
    setRequestForm({ title: '', description: '' });
    setShowRequest(false);
    load();
  }

  async function triage(id, status) {
    await api.patch(`/collateral/requests/${id}`, { status });
    load();
  }

  if (!assets) return <Loading />;
  const filtered = filterRows(assets, query, ['title', 'content_type', 'region_name', 'min_tier']);

  return (
    <div>
      <PageHeader
        title="Marketing Collateral Library"
        subtitle="Region-segmented, version-controlled — partners always get the latest approved asset for their tier."
        action={canRequest && <button className="btn btn-primary" onClick={() => setShowRequest(true)}>Request a custom asset</button>}
      />

      <div style={{ marginBottom: 14 }}>
        <SearchBox value={query} onChange={setQuery} placeholder="Search collateral…" />
      </div>

      {filtered.length === 0 ? <EmptyState text="No published collateral for your region/tier yet." /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, marginBottom: 20 }}>
          {filtered.map((a) => (
            <div key={a.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ margin: 0 }}>{a.content_type.replace('_', ' ')}</h3>
                <span className={`badge badge-${a.min_tier.toLowerCase()}`}>{a.min_tier}+</span>
              </div>
              <div style={{ fontWeight: 700 }}>{a.title}</div>
              <div style={{ color: 'var(--gray-500)', fontSize: 11 }}>{a.region_name || 'Global'} · {a.language} · v{a.version_no}</div>
              <button className="btn btn-outline" onClick={() => download(a.id)} style={{ marginTop: 'auto' }}>Download</button>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '16px 16px 0' }}><h2>Custom asset requests</h2></div>
        {requests.length === 0 ? (
          <div style={{ padding: 16, color: 'var(--gray-500)' }}>No custom asset requests yet.</div>
        ) : (
          <table>
            <thead><tr><th>Title</th><th>Description</th><th>Partner</th><th>Requested by</th><th>Status</th>{canPublish && <th></th>}</tr></thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>{r.title || '—'}</td>
                  <td>{r.description}</td>
                  <td>{r.company_name}</td>
                  <td>{r.first_name} {r.last_name}</td>
                  <td><span className={`badge ${REQUEST_STATUS_CLASS[r.status]}`}>{r.status.replace('_', ' ')}</span></td>
                  {canPublish && (
                    <td>
                      <select value={r.status} onChange={(e) => triage(r.id, e.target.value)}>
                        <option value="open">Open</option>
                        <option value="in_progress">In progress</option>
                        <option value="fulfilled">Fulfilled</option>
                        <option value="declined">Declined</option>
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canPublish && (
        <div className="card" style={{ marginTop: 16, color: 'var(--gray-500)' }}>
          Asset creation, version upload, and publish controls are available via the API
          (<code>POST /api/collateral</code>, <code>/versions</code>, <code>/publish</code>) — wire up an upload form here
          once file storage (S3 or equivalent) is selected.
        </div>
      )}

      {showRequest && (
        <Modal title="Request a custom asset" onClose={() => setShowRequest(false)}>
          <form onSubmit={submitRequest} style={{ display: 'grid', gap: 10 }}>
            <input placeholder="Title (optional)" value={requestForm.title} onChange={(e) => setRequestForm({ ...requestForm, title: e.target.value })} />
            <textarea rows={4} placeholder="e.g. Localised proposal for XYZ University" value={requestForm.description} onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })} required />
            <button className="btn btn-primary" type="submit" style={{ justifySelf: 'start' }}>Send request</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
