import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Loading, EmptyState, SearchBox, filterRows, Modal, ErrorBanner, SuccessBanner } from '../components/ui';

const ROLE_OPTIONS = [
  'SUPER_ADMIN', 'GLOBAL_PARTNER_MANAGER', 'REGIONAL_PARTNER_MANAGER',
  'PARTNER_ADMIN', 'PARTNER_SALES_USER', 'ACADEMIA_MARKETING', 'ACADEMIA_SALES',
];

const EMPTY_FORM = { email: '', firstName: '', lastName: '', designation: '', phoneDialingCode: '', phone: '', roleCode: 'PARTNER_SALES_USER', regionId: '', partnerId: '' };

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [query, setQuery] = useState('');
  const [regions, setRegions] = useState([]);
  const [partners, setPartners] = useState([]);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');

  const [editing, setEditing] = useState(null);
  const [pwUser, setPwUser] = useState(null);
  const [pwValue, setPwValue] = useState('');
  const [pwError, setPwError] = useState('');

  function load() {
    api.get('/users', { params: query ? { q: query } : {} }).then((res) => setUsers(res.data)).catch(() => setUsers([]));
  }
  useEffect(load, [query]);
  useEffect(() => {
    api.get('/regions').then((res) => setRegions(res.data));
    api.get('/partners').then((res) => setPartners(res.data)).catch(() => setPartners([]));
  }, []);

  const canCreate = ['SUPER_ADMIN', 'GLOBAL_PARTNER_MANAGER', 'REGIONAL_PARTNER_MANAGER', 'PARTNER_ADMIN'].includes(me?.role_code);

  async function submitAdd(e) {
    e.preventDefault();
    setAddError(''); setAddSuccess('');
    try {
      await api.post('/users', form);
      setAddSuccess('User created successfully!');
      setForm(EMPTY_FORM);
      load();
      setTimeout(() => { setShowAdd(false); setAddSuccess(''); }, 1200);
    } catch (err) {
      setAddError(err.response?.data?.error || 'Could not create user');
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    await api.patch(`/users/${editing.id}`, editing);
    setEditing(null);
    load();
  }

  async function toggleStatus(u) {
    const next = u.status === 'disabled' ? 'active' : 'disabled';
    await api.patch(`/users/${u.id}/status`, { status: next });
    load();
  }

  async function remove(u) {
    if (!window.confirm(`Delete ${u.first_name} ${u.last_name}? This cannot be undone.`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not delete user');
    }
  }

  async function submitPassword(e) {
    e.preventDefault();
    setPwError('');
    try {
      await api.patch(`/users/${pwUser.id}/password`, { newPassword: pwValue });
      setPwUser(null);
      setPwValue('');
    } catch (err) {
      setPwError(err.response?.data?.error || 'Could not set password');
    }
  }

  if (!users) return <Loading />;
  const filtered = filterRows(users, query, ['first_name', 'last_name', 'email']);

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Master directory of everyone with portal access — Academia staff and partner personnel."
        action={canCreate && <button className="btn btn-primary" onClick={() => setShowAdd(true)}>Add user</button>}
      />

      <div style={{ marginBottom: 14 }}>
        <SearchBox value={query} onChange={setQuery} placeholder="Search by name or email…" />
      </div>

      {filtered.length === 0 ? <EmptyState text="No users found." /> : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Designation</th><th>Region / Partner</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td>{u.first_name} {u.last_name}</td>
                  <td>{u.email}</td>
                  <td style={{ fontSize: 10 }}>{u.role_code}</td>
                  <td>{u.designation || '—'}</td>
                  <td>{u.region_name || u.partner_name || '—'}</td>
                  <td>
                    <span className={`badge ${u.status === 'active' ? 'badge-won' : u.status === 'disabled' ? 'badge-lost' : 'badge-open'}`}>{u.status}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-outline" style={{ padding: '3px 8px' }} onClick={() => setEditing({ id: u.id, firstName: u.first_name, lastName: u.last_name, designation: u.designation || '', phoneDialingCode: u.phone_dialing_code || '', phone: u.phone || '' })}>Edit</button>
                      <button className="btn btn-outline" style={{ padding: '3px 8px' }} onClick={() => setPwUser(u)}>Edit password</button>
                      <button className="btn btn-outline" style={{ padding: '3px 8px' }} onClick={() => toggleStatus(u)}>{u.status === 'disabled' ? 'Enable' : 'Disable'}</button>
                      <button className="btn btn-outline" style={{ padding: '3px 8px', color: 'var(--crimson)' }} onClick={() => remove(u)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <Modal title="Add user" onClose={() => setShowAdd(false)}>
          <ErrorBanner text={addError} />
          <SuccessBanner text={addSuccess} />
          <form onSubmit={submitAdd} style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input placeholder="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
              <input placeholder="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
            </div>
            <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <input placeholder="Designation" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 10 }}>
              <input placeholder="+91" value={form.phoneDialingCode} onChange={(e) => setForm({ ...form, phoneDialingCode: e.target.value })} />
              <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label>Role</label>
              <select value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value })}>
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {['REGIONAL_PARTNER_MANAGER', 'ACADEMIA_MARKETING', 'ACADEMIA_SALES'].includes(form.roleCode) && (
              <div>
                <label>Region</label>
                <select value={form.regionId} onChange={(e) => setForm({ ...form, regionId: e.target.value })}>
                  <option value="">Select a region</option>
                  {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            )}
            {['PARTNER_ADMIN', 'PARTNER_SALES_USER'].includes(form.roleCode) && (
              <div>
                <label>Partner</label>
                <select value={form.partnerId} onChange={(e) => setForm({ ...form, partnerId: e.target.value })}>
                  <option value="">Select a partner</option>
                  {partners.map((p) => <option key={p.id} value={p.id}>{p.company_name}</option>)}
                </select>
              </div>
            )}
            <p style={{ color: 'var(--gray-500)' }}>An activation email with a set-password link will be sent to this address.</p>
            <button className="btn btn-primary" type="submit" style={{ justifySelf: 'start' }}>Create user</button>
          </form>
        </Modal>
      )}

      {editing && (
        <Modal title="Edit user" onClose={() => setEditing(null)}>
          <form onSubmit={saveEdit} style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input placeholder="First name" value={editing.firstName} onChange={(e) => setEditing({ ...editing, firstName: e.target.value })} required />
              <input placeholder="Last name" value={editing.lastName} onChange={(e) => setEditing({ ...editing, lastName: e.target.value })} required />
            </div>
            <input placeholder="Designation" value={editing.designation} onChange={(e) => setEditing({ ...editing, designation: e.target.value })} />
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 10 }}>
              <input placeholder="+91" value={editing.phoneDialingCode} onChange={(e) => setEditing({ ...editing, phoneDialingCode: e.target.value })} />
              <input placeholder="Phone" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit" style={{ justifySelf: 'start' }}>Save</button>
          </form>
        </Modal>
      )}

      {pwUser && (
        <Modal title={`Set a new password for ${pwUser.first_name}`} onClose={() => setPwUser(null)}>
          <ErrorBanner text={pwError} />
          <p style={{ color: 'var(--gray-500)' }}>
            Existing passwords are stored as one-way hashes and can never be viewed — only replaced.
            This sets a new password directly (no email is sent).
          </p>
          <form onSubmit={submitPassword} style={{ display: 'grid', gap: 10 }}>
            <input type="password" placeholder="New password (min 8 characters)" value={pwValue} onChange={(e) => setPwValue(e.target.value)} minLength={8} required />
            <button className="btn btn-primary" type="submit" style={{ justifySelf: 'start' }}>Set password</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
