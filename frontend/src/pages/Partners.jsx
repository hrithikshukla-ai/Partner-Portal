import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Loading, TierBadge, EmptyState, SearchBox, filterRows, Modal, ErrorBanner, SuccessBanner } from '../components/ui';

const DOC_TYPES = ['company_registration', 'nda', 'partner_agreement', 'tax_compliance', 'other'];

export function PartnersList() {
  const { user } = useAuth();
  const [partners, setPartners] = useState(null);
  const [query, setQuery] = useState('');
  const [regions, setRegions] = useState([]);
  const [countries, setCountries] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ companyName: '', regionId: '', countryIds: [], salesTeamSize: '', existingSisErpExperience: '', timezone: '' });
  const [error, setError] = useState('');
  const canManage = ['SUPER_ADMIN', 'GLOBAL_PARTNER_MANAGER', 'REGIONAL_PARTNER_MANAGER'].includes(user?.role_code);

  function load() { api.get('/partners').then((res) => setPartners(res.data)); }
  useEffect(load, []);
  useEffect(() => { api.get('/regions').then((res) => setRegions(res.data)); }, []);
  useEffect(() => {
    if (!form.regionId) { setCountries([]); return; }
    api.get(`/regions/${form.regionId}/countries`).then((res) => setCountries(res.data));
  }, [form.regionId]);

  async function submitAdd(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/partners', { ...form, salesTeamSize: form.salesTeamSize ? Number(form.salesTeamSize) : undefined });
      setShowAdd(false);
      setForm({ companyName: '', regionId: '', countryIds: [], salesTeamSize: '', existingSisErpExperience: '', timezone: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add partner');
    }
  }

  function toggleCountry(id) {
    setForm((f) => ({ ...f, countryIds: f.countryIds.includes(id) ? f.countryIds.filter((c) => c !== id) : [...f.countryIds, id] }));
  }

  if (!partners) return <Loading />;
  const filtered = filterRows(partners, query, ['company_name', 'region_name', 'tier', 'status']);

  return (
    <div>
      <PageHeader
        title="Partners"
        subtitle="Every channel partner onboarded to Academia, replacing the old Partner Details tab."
        action={canManage && <button className="btn btn-primary" onClick={() => setShowAdd(true)}>Add partner</button>}
      />

      <div style={{ marginBottom: 14 }}>
        <SearchBox value={query} onChange={setQuery} placeholder="Search partners…" />
      </div>

      {filtered.length === 0 ? <EmptyState text="No partners yet." /> : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Company</th><th>Region</th><th>Tier</th><th>Status</th><th>Signed up</th></tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td><Link to={`/partners/${p.id}`} style={{ color: 'var(--navy)', fontWeight: 600 }}>{p.company_name}</Link></td>
                  <td>{p.region_name}</td>
                  <td><TierBadge tier={p.tier} /></td>
                  <td style={{ textTransform: 'capitalize' }}>{p.status.replace('_', ' ')}</td>
                  <td>{p.signup_date ? new Date(p.signup_date).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <Modal title="Add partner" onClose={() => setShowAdd(false)}>
          <ErrorBanner text={error} />
          <form onSubmit={submitAdd} style={{ display: 'grid', gap: 10 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Company name</label>
              <input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Region</label>
              <select value={form.regionId} onChange={(e) => setForm({ ...form, regionId: e.target.value, countryIds: [] })} required>
                <option value="">Select a region</option>
                {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            {form.regionId && (
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Countries this partner operates in (within {regions.find((r) => String(r.id) === String(form.regionId))?.name})</label>
                {countries.length === 0 ? <p style={{ color: 'var(--gray-500)' }}>No countries mapped to this region yet.</p> : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {countries.map((c) => (
                      <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--ghost)', padding: '5px 10px', borderRadius: 999, fontWeight: 500 }}>
                        <input type="checkbox" style={{ width: 'auto' }} checked={form.countryIds.includes(c.id)} onChange={() => toggleCountry(c.id)} />
                        {c.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Sales team size</label>
                <input type="number" value={form.salesTeamSize} onChange={(e) => setForm({ ...form, salesTeamSize: e.target.value })} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Timezone (IANA, e.g. Asia/Kolkata)</label>
                <input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="Asia/Kolkata" />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Existing SIS/ERP experience</label>
              <input value={form.existingSisErpExperience} onChange={(e) => setForm({ ...form, existingSisErpExperience: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit" style={{ justifySelf: 'start' }}>Add partner</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function PartnerDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [partner, setPartner] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [eligibility, setEligibility] = useState(null);
  const [inviteForm, setInviteForm] = useState({ email: '', firstName: '', lastName: '' });
  const [inviteResult, setInviteResult] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [docForm, setDocForm] = useState({ docType: 'other', label: '', file: null });
  const [docError, setDocError] = useState('');
  const canManage = ['SUPER_ADMIN', 'GLOBAL_PARTNER_MANAGER', 'REGIONAL_PARTNER_MANAGER'].includes(user?.role_code);
  const isPartnerAdmin = user?.role_code === 'PARTNER_ADMIN';
  const canInvite = canManage || isPartnerAdmin;
  const canManageDocs = canManage || ['PARTNER_ADMIN', 'PARTNER_SALES_USER'].includes(user?.role_code);
  const inviteRoleCode = isPartnerAdmin ? 'PARTNER_SALES_USER' : 'PARTNER_ADMIN';

  function load() {
    api.get(`/partners/${id}`).then((res) => setPartner(res.data));
    api.get(`/partners/${id}/tier-eligibility`).then((res) => setEligibility(res.data)).catch(() => setEligibility(null));
  }
  useEffect(load, [id]);
  useEffect(() => { api.get('/tiers').then((res) => setTiers(res.data)); }, []);

  async function changeTier(tierId) {
    await api.patch(`/partners/${id}/tier`, { tierId });
    load();
  }
  async function changeStatus(status) {
    await api.patch(`/partners/${id}/status`, { status });
    load();
  }

  async function sendInvite(e) {
    e.preventDefault();
    setInviteError('');
    setInviteResult('');
    try {
      await api.post(`/partners/${id}/users`, { ...inviteForm, roleCode: inviteRoleCode });
      setInviteResult('User created successfully! An activation email has been sent.');
      setInviteForm({ email: '', firstName: '', lastName: '' });
      load();
    } catch (err) {
      setInviteError(err.response?.data?.error || 'Could not send invite');
    }
  }

  async function uploadDocument(e) {
    e.preventDefault();
    setDocError('');
    if (!docForm.file) return setDocError('Choose a file first.');
    const fd = new FormData();
    fd.append('file', docForm.file);
    fd.append('docType', docForm.docType);
    fd.append('label', docForm.label);
    try {
      await api.post(`/partners/${id}/documents`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setDocForm({ docType: 'other', label: '', file: null });
      load();
    } catch (err) {
      setDocError(err.response?.data?.error || 'Could not upload document');
    }
  }

  async function replaceDocument(docId, file) {
    const fd = new FormData();
    fd.append('file', file);
    await api.patch(`/partners/${id}/documents/${docId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    load();
  }

  async function removeDocument(docId) {
    if (!window.confirm('Remove this document?')) return;
    await api.delete(`/partners/${id}/documents/${docId}`);
    load();
  }

  if (!partner) return <Loading />;

  return (
    <div>
      <PageHeader
        title={partner.company_name}
        subtitle={`${partner.region_name} · ${partner.countries.map((c) => c.name).join(', ') || 'No countries mapped'}`}
        action={<TierBadge tier={partner.tier} />}
      />

      {canManage && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Manage</h2>
          <div style={{ display: 'flex', gap: 20, marginBottom: eligibility?.upgradeAvailable ? 14 : 0 }}>
            <div>
              <label>Tier</label>
              <select value={tiers.find((t) => t.name === partner.tier)?.id || ''} onChange={(e) => changeTier(Number(e.target.value))}>
                {tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label>Status</label>
              <select value={partner.status} onChange={(e) => changeStatus(e.target.value)}>
                <option value="under_review">Under review</option>
                <option value="active">Active</option>
                <option value="on_hold">On hold</option>
                <option value="terminated">Terminated</option>
              </select>
            </div>
          </div>
          {eligibility && (
            <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>
              {eligibility.actuals.dealsWon} deals won, {eligibility.actuals.certifications} certifications.{' '}
              {eligibility.upgradeAvailable ? (
                <span>
                  Eligible for <strong style={{ color: 'var(--navy)' }}>{eligibility.suggestedTier}</strong> based on tier criteria —
                  {' '}<button className="btn btn-outline" style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => changeTier(eligibility.suggestedTierId)}>Apply upgrade</button>
                </span>
              ) : 'meets current tier criteria. This is a suggestion only — the tier change above still needs your sign-off.'}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <h2>Users</h2>
          {partner.users.length === 0 ? <p style={{ color: 'var(--gray-500)', marginBottom: 12 }}>No users invited yet.</p> : (
            <table style={{ marginBottom: canInvite ? 14 : 0 }}>
              <thead><tr><th>Name</th><th>Role</th><th>Status</th></tr></thead>
              <tbody>
                {partner.users.map((u) => (
                  <tr key={u.id}><td>{u.first_name} {u.last_name}</td><td>{u.role_code}</td><td>{u.status}</td></tr>
                ))}
              </tbody>
            </table>
          )}

          {canInvite && (
            <form onSubmit={sendInvite} style={{ display: 'grid', gap: 8, borderTop: partner.users.length ? '1px solid var(--gray-200)' : 'none', paddingTop: partner.users.length ? 12 : 0 }}>
              <label style={{ marginBottom: -2 }}>
                Invite a {inviteRoleCode === 'PARTNER_ADMIN' ? 'Partner Admin' : 'Partner Sales User'}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input placeholder="First name" value={inviteForm.firstName} onChange={(e) => setInviteForm({ ...inviteForm, firstName: e.target.value })} required />
                <input placeholder="Last name" value={inviteForm.lastName} onChange={(e) => setInviteForm({ ...inviteForm, lastName: e.target.value })} required />
              </div>
              <input type="email" placeholder="Email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} required />
              <button className="btn btn-primary" type="submit" style={{ justifySelf: 'start' }}>Send invite</button>

              <ErrorBanner text={inviteError} />
              <SuccessBanner text={inviteResult} />
            </form>
          )}
        </div>

        <div className="card">
          <h2>Documents</h2>
          {partner.documents.length === 0 ? <p style={{ color: 'var(--gray-500)' }}>No documents uploaded yet.</p> : (
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
              {partner.documents.map((d) => (
                <li key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--gray-200)' }}>
                  <div>
                    <a href={d.file_url} target="_blank" rel="noreferrer" style={{ color: 'var(--navy)', fontWeight: 600 }}>{d.label || d.doc_type.replace('_', ' ')}</a>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>{d.doc_type.replace('_', ' ')} · {new Date(d.uploaded_at).toLocaleDateString()}</div>
                  </div>
                  {canManageDocs && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <label className="btn btn-outline" style={{ padding: '3px 8px', margin: 0 }}>
                        Replace
                        <input type="file" style={{ display: 'none' }} onChange={(e) => e.target.files[0] && replaceDocument(d.id, e.target.files[0])} />
                      </label>
                      <button className="btn btn-outline" style={{ padding: '3px 8px', color: 'var(--crimson)' }} onClick={() => removeDocument(d.id)}>Delete</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canManageDocs && (
            <form onSubmit={uploadDocument} style={{ display: 'grid', gap: 8, marginTop: 14, borderTop: '1px solid var(--gray-200)', paddingTop: 12 }}>
              <label style={{ marginBottom: -2 }}>Add a document</label>
              <select value={docForm.docType} onChange={(e) => setDocForm({ ...docForm, docType: e.target.value })}>
                {DOC_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
              <input placeholder="Label (optional)" value={docForm.label} onChange={(e) => setDocForm({ ...docForm, label: e.target.value })} />
              <input type="file" onChange={(e) => setDocForm({ ...docForm, file: e.target.files[0] })} />
              <button className="btn btn-outline" type="submit" style={{ justifySelf: 'start' }}>Upload</button>
              <ErrorBanner text={docError} />
            </form>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Profile history</h2>
        {partner.history.length === 0 ? <p style={{ color: 'var(--gray-500)' }}>No history yet.</p> : (
          <table>
            <thead><tr><th>Event</th><th>Change</th><th>Note</th><th>Date</th></tr></thead>
            <tbody>
              {partner.history.map((h, i) => (
                <tr key={i}>
                  <td style={{ textTransform: 'capitalize' }}>{h.event_type.replace('_', ' ')}</td>
                  <td>{h.old_value || '—'} → {h.new_value || '—'}</td>
                  <td>{h.note || '—'}</td>
                  <td>{new Date(h.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
