import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Loading, EmptyState, Modal, ErrorBanner, SearchBox, filterRows } from '../components/ui';

function formatInTimezone(dateStr, timezone) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium', timeStyle: 'short', timeZone: timezone || undefined,
    }).format(new Date(dateStr));
  } catch {
    return new Date(dateStr).toLocaleString();
  }
}

function MeetingCard({ meeting, isPartnerView }) {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ actionItem: '', ownerText: '', promisedDate: '', remarks: '' });

  function load() { api.get(`/cadence/meetings/${meeting.id}/action-items`).then((res) => setItems(res.data)); }
  useEffect(() => { if (open) load(); }, [open]);

  async function addItem(e) {
    e.preventDefault();
    if (!form.actionItem.trim()) return;
    await api.post(`/cadence/meetings/${meeting.id}/action-items`, form);
    setForm({ actionItem: '', ownerText: '', promisedDate: '', remarks: '' });
    load();
  }

  async function updateItem(id, patch) {
    await api.patch(`/cadence/action-items/${id}`, patch);
    load();
  }

  const displayTz = isPartnerView ? meeting.partner_timezone : undefined;

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>
        <div>
          <div style={{ fontWeight: 700 }}>{formatInTimezone(meeting.scheduled_at, displayTz)}{displayTz ? ` (${displayTz})` : ''}</div>
          <div style={{ color: 'var(--gray-500)', fontSize: 11, textTransform: 'capitalize' }}>{meeting.frequency} · {meeting.company_name || 'Region-level'}</div>
        </div>
        <button className="btn btn-outline" style={{ padding: '4px 10px' }}>{open ? 'Hide MoM' : 'View MoM'}</button>
      </div>

      {open && (
        <div style={{ marginTop: 14, borderTop: '1px solid var(--gray-200)', paddingTop: 12 }}>
          {items === null ? <Loading /> : (
            <>
              <table>
                <thead>
                  <tr><th>Action item</th><th>SPOC / owner</th><th>Status</th><th>Promised</th><th>Completion date</th><th>Remarks</th></tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.action_item}</td>
                      <td>{it.owner_text || (it.first_name ? `${it.first_name} ${it.last_name}` : '—')}</td>
                      <td>
                        <select value={it.status} onChange={(e) => updateItem(it.id, { status: e.target.value })}>
                          <option value="pending">Pending</option>
                          <option value="done">Done</option>
                        </select>
                      </td>
                      <td>{it.promised_date ? new Date(it.promised_date).toLocaleDateString() : '—'}</td>
                      <td>
                        <input
                          type="date"
                          style={{ padding: '4px 6px' }}
                          value={it.completion_date ? it.completion_date.slice(0, 10) : ''}
                          onChange={(e) => updateItem(it.id, { completionDate: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          defaultValue={it.remarks || ''}
                          style={{ padding: '4px 6px' }}
                          onBlur={(e) => { if (e.target.value !== (it.remarks || '')) updateItem(it.id, { remarks: e.target.value }); }}
                        />
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--gray-500)' }}>No MoM items captured yet.</td></tr>}
                </tbody>
              </table>
              <form onSubmit={addItem} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, marginTop: 12 }}>
                <input placeholder="Action item" value={form.actionItem} onChange={(e) => setForm({ ...form, actionItem: e.target.value })} required />
                <input placeholder="SPOC / owner" value={form.ownerText} onChange={(e) => setForm({ ...form, ownerText: e.target.value })} />
                <input type="date" value={form.promisedDate} onChange={(e) => setForm({ ...form, promisedDate: e.target.value })} />
                <input placeholder="Remarks" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
                <button className="btn btn-outline" type="submit">Add</button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Cadence() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState(null);
  const [partners, setPartners] = useState([]);
  const [regions, setRegions] = useState([]);
  const [countries, setCountries] = useState([]);
  const [filters, setFilters] = useState({ partnerId: '', status: '', regionId: '', countryId: '' });
  const [query, setQuery] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [frequency, setFrequency] = useState('fortnightly');
  const [error, setError] = useState('');
  const isPartnerView = ['PARTNER_ADMIN', 'PARTNER_SALES_USER'].includes(user?.role_code);

  function load() {
    const params = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    api.get('/cadence/meetings', { params }).then((res) => setMeetings(res.data));
  }
  useEffect(load, [filters]);
  useEffect(() => {
    api.get('/partners').then((res) => setPartners(res.data)).catch(() => setPartners([]));
    api.get('/regions').then((res) => setRegions(res.data));
  }, []);
  useEffect(() => {
    if (!filters.regionId) { setCountries([]); return; }
    api.get(`/regions/${filters.regionId}/countries`).then((res) => setCountries(res.data));
  }, [filters.regionId]);

  async function schedule(e) {
    e.preventDefault();
    setError('');
    if (!scheduledAt) return;
    try {
      await api.post('/cadence/meetings', { scheduledAt, frequency });
      setScheduledAt('');
      setShowSchedule(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not schedule meeting');
    }
  }

  if (!meetings) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Cadence & MoM Tracker"
        subtitle={isPartnerView
          ? 'Meeting times are shown in your organisation\'s timezone.'
          : 'Every cadence meeting linked to accounts and deals — action items with owners and promised dates, not a free-text log.'}
        action={<button className="btn btn-primary" onClick={() => setShowSchedule(true)}>Schedule a meeting</button>}
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <SearchBox value={query} onChange={setQuery} placeholder="Search by partner…" />
        <select style={{ width: 170 }} value={filters.partnerId} onChange={(e) => setFilters({ ...filters, partnerId: e.target.value })}>
          <option value="">By partner</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.company_name}</option>)}
        </select>
        <select style={{ width: 130 }} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">By status</option>
          <option value="pending">Pending</option>
          <option value="done">Done</option>
        </select>
        <select style={{ width: 150 }} value={filters.regionId} onChange={(e) => setFilters({ ...filters, regionId: e.target.value, countryId: '' })}>
          <option value="">By region</option>
          {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select style={{ width: 150 }} value={filters.countryId} onChange={(e) => setFilters({ ...filters, countryId: e.target.value })} disabled={!filters.regionId}>
          <option value="">By country</option>
          {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {(() => {
        const searched = filterRows(meetings, query, ['company_name']);
        return searched.length === 0
          ? <EmptyState text="No cadence meetings match." />
          : searched.map((m) => <MeetingCard key={m.id} meeting={m} isPartnerView={isPartnerView} />);
      })()}

      {showSchedule && (
        <Modal title="Schedule a cadence meeting" onClose={() => setShowSchedule(false)}>
          <ErrorBanner text={error} />
          <form onSubmit={schedule} style={{ display: 'grid', gap: 10 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Date &amp; time</label>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} required />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Frequency</label>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="adhoc">Ad hoc</option>
              </select>
            </div>
            <button className="btn btn-primary" type="submit" style={{ justifySelf: 'start' }}>Schedule</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
