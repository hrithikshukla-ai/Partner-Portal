import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { PageHeader, Loading, Modal, ErrorBanner } from '../components/ui';

const EMPTY_COUNTRY = { name: '', isoCode: '', dialingCode: '', notes: '' };
const EMPTY_TIER = { name: '', rank: '', minDealsWon: 0, minCertifications: 0, collateralAccess: 'standard', mdfEligible: false };

export default function Hierarchy() {
  const [regions, setRegions] = useState(null);
  const [countriesByRegion, setCountriesByRegion] = useState({});
  const [tiers, setTiers] = useState(null);
  const [error, setError] = useState('');

  const [newRegion, setNewRegion] = useState({ name: '', code: '' });
  const [editingRegion, setEditingRegion] = useState(null);

  const [countryModal, setCountryModal] = useState(null); // { regionId, country: {...} | null }
  const [tierModal, setTierModal] = useState(null); // tier object | null | 'new'

  function loadRegions() {
    api.get('/regions').then((res) => {
      setRegions(res.data);
      res.data.forEach((r) => {
        api.get(`/regions/${r.id}/countries`).then((cr) => {
          setCountriesByRegion((prev) => ({ ...prev, [r.id]: cr.data }));
        });
      });
    });
  }
  function loadTiers() {
    api.get('/tiers').then((res) => setTiers(res.data));
  }
  useEffect(() => { loadRegions(); loadTiers(); }, []);

  async function createRegion(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/regions', newRegion);
      setNewRegion({ name: '', code: '' });
      loadRegions();
    } catch (err) { setError(err.response?.data?.error || 'Could not add region'); }
  }

  async function saveRegion(e) {
    e.preventDefault();
    setError('');
    try {
      await api.patch(`/regions/${editingRegion.id}`, editingRegion);
      setEditingRegion(null);
      loadRegions();
    } catch (err) { setError(err.response?.data?.error || 'Could not update region'); }
  }

  async function deleteRegion(region) {
    if (!window.confirm(`Delete region "${region.name}"?`)) return;
    try {
      await api.delete(`/regions/${region.id}`);
      loadRegions();
    } catch (err) { alert(err.response?.data?.error || 'Could not delete region'); }
  }

  async function saveCountry(e) {
    e.preventDefault();
    setError('');
    const { regionId, country } = countryModal;
    try {
      if (country.id) {
        await api.patch(`/countries/${country.id}`, country);
      } else {
        await api.post(`/regions/${regionId}/countries`, country);
      }
      setCountryModal(null);
      loadRegions();
    } catch (err) { setError(err.response?.data?.error || 'Could not save country'); }
  }

  async function deleteCountry(country) {
    if (!window.confirm(`Delete "${country.name}"?`)) return;
    try {
      await api.delete(`/countries/${country.id}`);
      loadRegions();
    } catch (err) { alert(err.response?.data?.error || 'Could not delete country'); }
  }

  async function saveTier(e) {
    e.preventDefault();
    setError('');
    try {
      if (tierModal.id) {
        await api.patch(`/tiers/${tierModal.id}`, tierModal);
      } else {
        await api.post('/tiers', tierModal);
      }
      setTierModal(null);
      loadTiers();
    } catch (err) { setError(err.response?.data?.error || 'Could not save tier'); }
  }

  async function deleteTier(tier) {
    if (!window.confirm(`Delete tier "${tier.name}"?`)) return;
    try {
      await api.delete(`/tiers/${tier.id}`);
      loadTiers();
    } catch (err) { alert(err.response?.data?.error || 'Could not delete tier'); }
  }

  if (!regions || !tiers) return <Loading />;

  return (
    <div>
      <PageHeader title="Region & Access Control" subtitle="Define the Region → Country → Partner hierarchy and the Tier master that RBAC and collateral segmentation are built on." />
      <ErrorBanner text={error} />

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Add a region</h2>
        <form onSubmit={createRegion} style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0, flex: 1 }}>
            <label>Region name</label>
            <input value={newRegion.name} onChange={(e) => setNewRegion({ ...newRegion, name: e.target.value })} required />
          </div>
          <div className="field" style={{ marginBottom: 0, width: 100 }}>
            <label>Code</label>
            <input value={newRegion.code} onChange={(e) => setNewRegion({ ...newRegion, code: e.target.value })} required />
          </div>
          <button className="btn btn-primary" type="submit">Add region</button>
        </form>
      </div>

      {regions.map((r) => (
        <div className="card" key={r.id} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>{r.name} <span style={{ color: 'var(--gray-500)', fontWeight: 500 }}>({r.code})</span></h2>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-outline" style={{ padding: '4px 10px' }} onClick={() => setEditingRegion({ id: r.id, name: r.name, code: r.code })}>Modify</button>
              <button className="btn btn-outline" style={{ padding: '4px 10px', color: 'var(--crimson)' }} onClick={() => deleteRegion(r)}>Delete</button>
            </div>
          </div>
          <table>
            <thead><tr><th>Country</th><th>ISO</th><th>Dialing code</th><th>Notes</th><th></th></tr></thead>
            <tbody>
              {(countriesByRegion[r.id] || []).map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.iso_code}</td>
                  <td>{c.dialing_code}</td>
                  <td>{c.notes || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-outline" style={{ padding: '3px 8px' }} onClick={() => setCountryModal({ regionId: r.id, country: { id: c.id, name: c.name, isoCode: c.iso_code, dialingCode: c.dialing_code, notes: c.notes || '' } })}>Modify</button>
                      <button className="btn btn-outline" style={{ padding: '3px 8px', color: 'var(--crimson)' }} onClick={() => deleteCountry(c)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {(countriesByRegion[r.id] || []).length === 0 && (
                <tr><td colSpan={5} style={{ color: 'var(--gray-500)' }}>No countries mapped yet.</td></tr>
              )}
            </tbody>
          </table>
          <button className="btn btn-outline" style={{ marginTop: 12 }} onClick={() => setCountryModal({ regionId: r.id, country: { ...EMPTY_COUNTRY } })}>
            Add country
          </button>
        </div>
      ))}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Tier master</h2>
          <button className="btn btn-primary" onClick={() => setTierModal({ ...EMPTY_TIER })}>Add tier</button>
        </div>
        <table>
          <thead><tr><th>Tier</th><th>Rank</th><th>Min. deals won</th><th>Min. certifications</th><th>MDF eligible</th><th></th></tr></thead>
          <tbody>
            {tiers.map((t) => (
              <tr key={t.id}>
                <td style={{ fontWeight: 700 }}>{t.name}</td>
                <td>{t.rank}</td>
                <td>{t.min_deals_won}</td>
                <td>{t.min_certifications}</td>
                <td>{t.mdf_eligible ? 'Yes' : 'No'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-outline" style={{ padding: '3px 8px' }} onClick={() => setTierModal({ id: t.id, name: t.name, rank: t.rank, minDealsWon: t.min_deals_won, minCertifications: t.min_certifications, collateralAccess: t.collateral_access, mdfEligible: t.mdf_eligible })}>Modify</button>
                    <button className="btn btn-outline" style={{ padding: '3px 8px', color: 'var(--crimson)' }} onClick={() => deleteTier(t)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingRegion && (
        <Modal title="Modify region" onClose={() => setEditingRegion(null)}>
          <form onSubmit={saveRegion} style={{ display: 'grid', gap: 10 }}>
            <input value={editingRegion.name} onChange={(e) => setEditingRegion({ ...editingRegion, name: e.target.value })} required />
            <input value={editingRegion.code} onChange={(e) => setEditingRegion({ ...editingRegion, code: e.target.value })} required />
            <button className="btn btn-primary" type="submit" style={{ justifySelf: 'start' }}>Save</button>
          </form>
        </Modal>
      )}

      {countryModal && (
        <Modal title={countryModal.country.id ? 'Modify country' : 'Add country'} onClose={() => setCountryModal(null)}>
          <form onSubmit={saveCountry} style={{ display: 'grid', gap: 10 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Country name</label>
              <input value={countryModal.country.name} onChange={(e) => setCountryModal({ ...countryModal, country: { ...countryModal.country, name: e.target.value } })} required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>ISO code</label>
                <input value={countryModal.country.isoCode} onChange={(e) => setCountryModal({ ...countryModal, country: { ...countryModal.country, isoCode: e.target.value } })} required />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Dialing code</label>
                <input placeholder="+91" value={countryModal.country.dialingCode} onChange={(e) => setCountryModal({ ...countryModal, country: { ...countryModal.country, dialingCode: e.target.value } })} required />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Notes</label>
              <textarea rows={3} placeholder="Any note applicable for this country (compliance, data residency, etc.)" value={countryModal.country.notes} onChange={(e) => setCountryModal({ ...countryModal, country: { ...countryModal.country, notes: e.target.value } })} />
            </div>
            <button className="btn btn-primary" type="submit" style={{ justifySelf: 'start' }}>Save</button>
          </form>
        </Modal>
      )}

      {tierModal && (
        <Modal title={tierModal.id ? 'Modify tier' : 'Add tier'} onClose={() => setTierModal(null)}>
          <form onSubmit={saveTier} style={{ display: 'grid', gap: 10 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Tier name</label>
              <input value={tierModal.name} onChange={(e) => setTierModal({ ...tierModal, name: e.target.value })} required />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Rank (higher = better tier, must be unique)</label>
              <input type="number" value={tierModal.rank} onChange={(e) => setTierModal({ ...tierModal, rank: Number(e.target.value) })} required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Min. deals won</label>
                <input type="number" value={tierModal.minDealsWon} onChange={(e) => setTierModal({ ...tierModal, minDealsWon: Number(e.target.value) })} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Min. certifications</label>
                <input type="number" value={tierModal.minCertifications} onChange={(e) => setTierModal({ ...tierModal, minCertifications: Number(e.target.value) })} />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={!!tierModal.mdfEligible} onChange={(e) => setTierModal({ ...tierModal, mdfEligible: e.target.checked })} />
              MDF eligible
            </label>
            <button className="btn btn-primary" type="submit" style={{ justifySelf: 'start' }}>Save</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
