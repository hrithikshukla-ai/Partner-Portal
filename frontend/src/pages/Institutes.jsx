import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Loading, EmptyState, SearchBox, filterRows, Modal, ErrorBanner } from '../components/ui';

const TYPE_OPTIONS = ['Private', 'Public', 'Semi-govt'];

const EMPTY_FORM = {
  name: '', personaId: '', type: 'Private', website: '', studentCount: '', campusCount: '',
  regionId: '', countryId: '', assignedPartnerId: '', isExistingClient: false,
  contactName: '', contactDesignation: '', contactEmail: '', contactDialingCode: '', contactPhone: '',
};

function useMasters() {
  const [personas, setPersonas] = useState([]);
  const [regions, setRegions] = useState([]);
  const [partners, setPartners] = useState([]);
  useEffect(() => {
    api.get('/institutes/personas').then((res) => setPersonas(res.data));
    api.get('/regions').then((res) => setRegions(res.data));
    api.get('/partners').then((res) => setPartners(res.data)).catch(() => setPartners([]));
  }, []);
  return { personas, regions, partners };
}

export function InstitutesList() {
  const { user } = useAuth();
  const { personas, regions, partners } = useMasters();
  const [institutes, setInstitutes] = useState(null);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({ partnerId: '', regionId: '', countryId: '' });
  const [countries, setCountries] = useState([]);
  const [formCountries, setFormCountries] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const canAdd = ['SUPER_ADMIN', 'GLOBAL_PARTNER_MANAGER', 'REGIONAL_PARTNER_MANAGER'].includes(user?.role_code);

  function load() {
    const params = {};
    if (filters.partnerId) params.partnerId = filters.partnerId;
    if (filters.regionId) params.regionId = filters.regionId;
    if (filters.countryId) params.countryId = filters.countryId;
    api.get('/institutes', { params }).then((res) => setInstitutes(res.data)).catch(() => setInstitutes([]));
  }
  useEffect(load, [filters]);

  useEffect(() => {
    if (!filters.regionId) { setCountries([]); return; }
    api.get(`/regions/${filters.regionId}/countries`).then((res) => setCountries(res.data));
  }, [filters.regionId]);

  useEffect(() => {
    if (!form.regionId) { setFormCountries([]); return; }
    api.get(`/regions/${form.regionId}/countries`).then((res) => setFormCountries(res.data));
  }, [form.regionId]);

  async function submitAdd(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/institutes', {
        ...form,
        studentCount: form.studentCount ? Number(form.studentCount) : undefined,
        campusCount: form.campusCount ? Number(form.campusCount) : undefined,
      });
      setShowAdd(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add target account');
    }
  }

  if (!institutes) return <Loading />;
  const filtered = filterRows(institutes, query, ['name', 'persona', 'country', 'region', 'assigned_partner_name']);

  return (
    <div>
      <PageHeader
        title="Target Accounts"
        subtitle="Deduplicated institute database, replacing Target Accounts, KSA Target Accounts, Target Persona, and Existing Clients tabs."
        action={canAdd && <button className="btn btn-primary" onClick={() => setShowAdd(true)}>Add target account</button>}
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <SearchBox value={query} onChange={setQuery} placeholder="Search target accounts…" />
        <select style={{ width: 170 }} value={filters.partnerId} onChange={(e) => setFilters({ ...filters, partnerId: e.target.value })}>
          <option value="">All partners</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.company_name}</option>)}
        </select>
        <select style={{ width: 150 }} value={filters.regionId} onChange={(e) => setFilters({ ...filters, regionId: e.target.value, countryId: '' })}>
          <option value="">All regions</option>
          {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select style={{ width: 150 }} value={filters.countryId} onChange={(e) => setFilters({ ...filters, countryId: e.target.value })} disabled={!filters.regionId}>
          <option value="">All countries</option>
          {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? <EmptyState text="No target accounts match these filters." /> : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Institute</th><th>Category</th><th>Type</th><th>Country</th><th>Region</th><th>Assigned partner</th><th>Existing client</th></tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id}>
                  <td><Link to={`/institutes/${i.id}`} style={{ color: 'var(--navy)', fontWeight: 600 }}>{i.name}</Link></td>
                  <td>{i.persona}</td>
                  <td>{i.type}</td>
                  <td>{i.country}</td>
                  <td>{i.region}</td>
                  <td>{i.assigned_partner_name || '—'}</td>
                  <td>{i.is_existing_client ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <Modal title="Add target account" onClose={() => setShowAdd(false)} width={560}>
          <ErrorBanner text={error} />
          <form onSubmit={submitAdd} style={{ display: 'grid', gap: 10 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Institute name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Category</label>
                <select value={form.personaId} onChange={(e) => setForm({ ...form, personaId: e.target.value })} required>
                  <option value="">Select category</option>
                  {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Type</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Website</label>
              <input type="url" placeholder="https://www.example.edu" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>No. of students</label>
                <input type="number" min="0" value={form.studentCount} onChange={(e) => setForm({ ...form, studentCount: e.target.value })} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>No. of campuses</label>
                <input type="number" min="0" value={form.campusCount} onChange={(e) => setForm({ ...form, campusCount: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Region</label>
                <select value={form.regionId} onChange={(e) => setForm({ ...form, regionId: e.target.value, countryId: '' })} required>
                  <option value="">Select region</option>
                  {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Country</label>
                <select value={form.countryId} onChange={(e) => setForm({ ...form, countryId: e.target.value })} required disabled={!form.regionId}>
                  <option value="">Select country</option>
                  {formCountries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Assigned partner (optional)</label>
              <select value={form.assignedPartnerId} onChange={(e) => setForm({ ...form, assignedPartnerId: e.target.value })}>
                <option value="">Unassigned</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.company_name}</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={form.isExistingClient} onChange={(e) => setForm({ ...form, isExistingClient: e.target.checked })} />
              Existing client
            </label>

            <h3 style={{ marginTop: 6 }}>Primary contact</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input placeholder="Contact name" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
              <input placeholder="Designation" value={form.contactDesignation} onChange={(e) => setForm({ ...form, contactDesignation: e.target.value })} />
            </div>
            <input type="email" placeholder="Email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 10 }}>
              <select value={form.contactDialingCode} onChange={(e) => setForm({ ...form, contactDialingCode: e.target.value })}>
                <option value="">Code</option>
                {formCountries.map((c) => <option key={c.id} value={c.dialing_code}>{c.dialing_code} {c.name}</option>)}
              </select>
              <input type="tel" placeholder="Phone number" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            </div>

            <button className="btn btn-primary" type="submit" style={{ justifySelf: 'start' }}>Add target account</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function InstituteDetail() {
  const { id } = useParams();
  const [institute, setInstitute] = useState(null);
  const [note, setNote] = useState('');
  const [contact, setContact] = useState({ name: '', designation: '', email: '', dialingCode: '', phone: '' });

  function load() { api.get(`/institutes/${id}`).then((res) => setInstitute(res.data)); }
  useEffect(load, [id]);

  async function addNote(e) {
    e.preventDefault();
    if (!note.trim()) return;
    await api.post(`/institutes/${id}/notes`, { note });
    setNote('');
    load();
  }

  async function addContact(e) {
    e.preventDefault();
    if (!contact.name.trim()) return;
    await api.post(`/institutes/${id}/contacts`, contact);
    setContact({ name: '', designation: '', email: '', dialingCode: '', phone: '' });
    load();
  }

  if (!institute) return <Loading />;

  return (
    <div>
      <PageHeader title={institute.name} subtitle={`${institute.persona} · ${institute.type} · ${institute.country}, ${institute.region}`} />

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Overview</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 12 }}>
          <div><label>Website</label><div>{institute.website ? <a href={institute.website} target="_blank" rel="noreferrer">{institute.website}</a> : '—'}</div></div>
          <div><label>No. of students</label><div>{institute.student_count ?? '—'}</div></div>
          <div><label>No. of campuses</label><div>{institute.campus_count ?? '—'}</div></div>
          <div><label>Existing client</label><div>{institute.is_existing_client ? 'Yes' : 'No'}</div></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 12, marginTop: 12 }}>
          <div><label>Primary contact</label><div>{institute.contact_name || '—'}</div></div>
          <div><label>Designation</label><div>{institute.contact_designation || '—'}</div></div>
          <div><label>Email</label><div>{institute.contact_email || '—'}</div></div>
          <div><label>Phone</label><div>{institute.contact_phone ? `${institute.contact_dialing_code || ''} ${institute.contact_phone}` : '—'}</div></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <h2>Additional contacts</h2>
          {institute.contacts.length === 0 ? <p style={{ color: 'var(--gray-500)' }}>No additional contacts yet.</p> : (
            <table>
              <thead><tr><th>Name</th><th>Designation</th><th>Email</th><th>Phone</th></tr></thead>
              <tbody>
                {institute.contacts.map((c) => (
                  <tr key={c.id}><td>{c.name}</td><td>{c.designation || '—'}</td><td>{c.email || '—'}</td><td>{c.phone ? `${c.dialing_code || ''} ${c.phone}` : '—'}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <form onSubmit={addContact} style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input placeholder="Name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            <input placeholder="Designation" value={contact.designation} onChange={(e) => setContact({ ...contact, designation: e.target.value })} />
            <input placeholder="Email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
            <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 8 }}>
              <input placeholder="+91" value={contact.dialingCode} onChange={(e) => setContact({ ...contact, dialingCode: e.target.value })} />
              <input placeholder="Phone" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
            </div>
            <button className="btn btn-outline" type="submit" style={{ gridColumn: '1 / -1' }}>Add contact</button>
          </form>
        </div>

        <div className="card">
          <h2>Notes timeline</h2>
          <div style={{ maxHeight: 260, overflowY: 'auto', marginBottom: 12 }}>
            {institute.notes.length === 0 ? <p style={{ color: 'var(--gray-500)' }}>No notes yet.</p> : institute.notes.map((n) => (
              <div key={n.id} style={{ borderBottom: '1px solid var(--gray-200)', padding: '8px 0' }}>
                <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{n.first_name} {n.last_name} · {new Date(n.created_at).toLocaleString()}</div>
                <div>{n.note}</div>
              </div>
            ))}
          </div>
          <form onSubmit={addNote} style={{ display: 'flex', gap: 8 }}>
            <input placeholder="Add a note…" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn btn-outline" type="submit">Add</button>
          </form>
        </div>
      </div>
    </div>
  );
}
