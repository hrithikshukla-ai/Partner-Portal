import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Loading, EmptyState, Modal, ErrorBanner, SearchBox, filterRows } from '../components/ui';

function TypeMaster({ title, listUrl, addLabel }) {
  const [items, setItems] = useState(null);
  const [modal, setModal] = useState(null); // { id?, name } | null
  const [error, setError] = useState('');

  function load() { api.get(listUrl).then((res) => setItems(res.data)); }
  useEffect(load, []);

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      if (modal.id) await api.patch(`${listUrl}/${modal.id}`, { name: modal.name });
      else await api.post(listUrl, { name: modal.name });
      setModal(null);
      load();
    } catch (err) { setError(err.response?.data?.error || 'Could not save'); }
  }

  async function remove(item) {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try {
      await api.delete(`${listUrl}/${item.id}`);
      load();
    } catch (err) { alert(err.response?.data?.error || 'Could not delete'); }
  }

  if (!items) return <Loading />;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>{title}</h2>
        <button className="btn btn-outline" onClick={() => setModal({ name: '' })}>{addLabel}</button>
      </div>
      {items.length === 0 ? <p style={{ color: 'var(--gray-500)' }}>None defined yet.</p> : (
        <table>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>{it.name}</td>
                <td style={{ width: 140 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-outline" style={{ padding: '3px 8px' }} onClick={() => setModal({ id: it.id, name: it.name })}>Modify</button>
                    <button className="btn btn-outline" style={{ padding: '3px 8px', color: 'var(--crimson)' }} onClick={() => remove(it)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modal && (
        <Modal title={modal.id ? 'Modify' : addLabel} onClose={() => setModal(null)}>
          <ErrorBanner text={error} />
          <form onSubmit={save} style={{ display: 'grid', gap: 10 }}>
            <input value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} required autoFocus />
            <button className="btn btn-primary" type="submit" style={{ justifySelf: 'start' }}>Save</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function BatchDetail({ batch, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [personnel, setPersonnel] = useState([]);
  const [selected, setSelected] = useState([]);
  const [certFile, setCertFile] = useState({});

  function load() { api.get(`/training/batches/${batch.id}`).then((res) => setDetail(res.data)); }
  useEffect(load, [batch.id]);
  useEffect(() => {
    api.get('/users').then((res) => setPersonnel(res.data.filter((u) => ['PARTNER_ADMIN', 'PARTNER_SALES_USER'].includes(u.role_code))));
  }, []);

  async function enroll() {
    if (selected.length === 0) return;
    await api.post(`/training/batches/${batch.id}/enroll`, { userIds: selected.map(Number) });
    setSelected([]);
    load();
    onChanged();
  }

  async function markStatus(enrollmentId, status) {
    await api.patch(`/training/enrollments/${enrollmentId}`, { status });
    load();
  }

  async function issueCertificate(enrollmentId) {
    const file = certFile[enrollmentId];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    await api.post(`/training/enrollments/${enrollmentId}/certificate`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    load();
  }

  if (!detail) return <Modal title={batch.name} onClose={onClose}><Loading /></Modal>;

  return (
    <Modal title={detail.name} onClose={onClose} width={640}>
      <p style={{ color: 'var(--gray-500)' }}>
        {detail.category === 'certification' ? detail.certification_type_name : detail.training_type_name} ·{' '}
        {new Date(detail.start_date).toLocaleDateString()} – {new Date(detail.end_date).toLocaleDateString()}
      </p>

      <h3>Enrolled personnel</h3>
      {detail.enrollments.length === 0 ? <p style={{ color: 'var(--gray-500)' }}>No one enrolled yet.</p> : (
        <table>
          <thead><tr><th>Name</th><th>Partner</th><th>Status</th>{detail.category === 'certification' && <th>Certificate</th>}</tr></thead>
          <tbody>
            {detail.enrollments.map((en) => (
              <tr key={en.id}>
                <td>{en.first_name} {en.last_name}</td>
                <td>{en.partner_name || '—'}</td>
                <td>
                  <select value={en.status} onChange={(e) => markStatus(en.id, e.target.value)}>
                    <option value="enrolled">Enrolled</option>
                    <option value="completed">Completed</option>
                    <option value="no_show">No-show</option>
                  </select>
                </td>
                {detail.category === 'certification' && (
                  <td>
                    {en.certificate_file_url ? (
                      <a href={en.certificate_file_url} target="_blank" rel="noreferrer">View ({en.certificate_file_type})</a>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ padding: 4 }} onChange={(e) => setCertFile({ ...certFile, [en.id]: e.target.files[0] })} />
                        <button className="btn btn-outline" style={{ padding: '3px 8px' }} onClick={() => issueCertificate(en.id)}>Upload</button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={{ marginTop: 16 }}>Enroll partner personnel</h3>
      <select multiple value={selected} onChange={(e) => setSelected(Array.from(e.target.selectedOptions, (o) => o.value))} style={{ height: 100 }}>
        {personnel.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name} — {p.partner_name}</option>)}
      </select>
      <button className="btn btn-outline" style={{ marginTop: 8 }} onClick={enroll}>Enroll selected</button>
    </Modal>
  );
}

function BatchesAdmin() {
  const [batches, setBatches] = useState(null);
  const [trainingTypes, setTrainingTypes] = useState([]);
  const [certTypes, setCertTypes] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ category: 'training', trainingTypeId: '', certificationTypeId: '', name: '', startDate: '', endDate: '' });
  const [error, setError] = useState('');
  const [detailBatch, setDetailBatch] = useState(null);
  const [query, setQuery] = useState('');

  function load() { api.get('/training/batches').then((res) => setBatches(res.data)); }
  useEffect(load, []);
  useEffect(() => {
    api.get('/training/types').then((res) => setTrainingTypes(res.data));
    api.get('/training/certification-types').then((res) => setCertTypes(res.data));
  }, []);

  async function createBatch(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/training/batches', form);
      setShowAdd(false);
      setForm({ category: 'training', trainingTypeId: '', certificationTypeId: '', name: '', startDate: '', endDate: '' });
      load();
    } catch (err) { setError(err.response?.data?.error || 'Could not create batch'); }
  }

  async function removeBatch(b) {
    if (!window.confirm(`Delete batch "${b.name}"?`)) return;
    await api.delete(`/training/batches/${b.id}`);
    load();
  }

  if (!batches) return <Loading />;
  const filtered = filterRows(batches, query, ['name', 'training_type_name', 'certification_type_name']);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Batches</h2>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>Add batch</button>
      </div>
      <div style={{ marginBottom: 12 }}>
        <SearchBox value={query} onChange={setQuery} placeholder="Search batches…" />
      </div>
      {filtered.length === 0 ? <p style={{ color: 'var(--gray-500)' }}>No batches match.</p> : (
        <table>
          <thead><tr><th>Batch</th><th>Category</th><th>Type</th><th>Window</th><th>Enrolled</th><th></th></tr></thead>
          <tbody>
            {filtered.map((b) => (
              <tr key={b.id}>
                <td><a onClick={() => setDetailBatch(b)} style={{ color: 'var(--navy)', fontWeight: 600, cursor: 'pointer' }}>{b.name}</a></td>
                <td style={{ textTransform: 'capitalize' }}>{b.category}</td>
                <td>{b.training_type_name || b.certification_type_name}</td>
                <td>{new Date(b.start_date).toLocaleDateString()} – {new Date(b.end_date).toLocaleDateString()}</td>
                <td>{b.enrolled_count}</td>
                <td><button className="btn btn-outline" style={{ padding: '3px 8px', color: 'var(--crimson)' }} onClick={() => removeBatch(b)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showAdd && (
        <Modal title="Add batch" onClose={() => setShowAdd(false)}>
          <ErrorBanner text={error} />
          <form onSubmit={createBatch} style={{ display: 'grid', gap: 10 }}>
            <div>
              <label>Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value, trainingTypeId: '', certificationTypeId: '' })}>
                <option value="training">Training</option>
                <option value="certification">Certification</option>
              </select>
            </div>
            {form.category === 'training' ? (
              <div>
                <label>Training type</label>
                <select value={form.trainingTypeId} onChange={(e) => setForm({ ...form, trainingTypeId: e.target.value })} required>
                  <option value="">Select type</option>
                  {trainingTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label>Certification type</label>
                <select value={form.certificationTypeId} onChange={(e) => setForm({ ...form, certificationTypeId: e.target.value })} required>
                  <option value="">Select type</option>
                  {certTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            <input placeholder="Batch name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label>Start date</label><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required /></div>
              <div><label>End date</label><input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required /></div>
            </div>
            <button className="btn btn-primary" type="submit" style={{ justifySelf: 'start' }}>Create batch</button>
          </form>
        </Modal>
      )}

      {detailBatch && <BatchDetail batch={detailBatch} onClose={() => setDetailBatch(null)} onChanged={load} />}
    </div>
  );
}

function MyTraining() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get('/training/my-batches').then((res) => setRows(res.data)); }, []);
  if (!rows) return <Loading />;

  return (
    <div className="card" style={{ padding: 0 }}>
      {rows.length === 0 ? <EmptyState text="You're not enrolled in any training or certification batches yet." /> : (
        <table>
          <thead><tr><th>Batch</th><th>Category</th><th>Type</th><th>Window</th><th>Status</th><th>Certificate</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.enrollment_id}>
                <td>{r.name}</td>
                <td style={{ textTransform: 'capitalize' }}>{r.category}</td>
                <td>{r.training_type_name || r.certification_type_name}</td>
                <td>{new Date(r.start_date).toLocaleDateString()} – {new Date(r.end_date).toLocaleDateString()}</td>
                <td>
                  <span className={`badge ${r.status === 'completed' ? 'badge-won' : r.status === 'no_show' ? 'badge-lost' : 'badge-open'}`}>{r.status.replace('_', ' ')}</span>
                </td>
                <td>{r.certificate_file_url ? <a href={r.certificate_file_url} target="_blank" rel="noreferrer">Download</a> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function Training() {
  const { user } = useAuth();
  const isAdmin = ['SUPER_ADMIN', 'GLOBAL_PARTNER_MANAGER', 'REGIONAL_PARTNER_MANAGER', 'ACADEMIA_MARKETING'].includes(user?.role_code);

  return (
    <div>
      <PageHeader
        title="Training & Certification"
        subtitle="Training and certification types are managed as masters; batches enroll partner personnel and carry the certificate once complete."
      />

      {isAdmin ? (
        <div style={{ display: 'grid', gap: 16 }}>
          <BatchesAdmin />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <TypeMaster title="Training type master" listUrl="/training/types" addLabel="Add training type" />
            <TypeMaster title="Certification type master" listUrl="/training/certification-types" addLabel="Add certification type" />
          </div>
        </div>
      ) : (
        <MyTraining />
      )}
    </div>
  );
}
