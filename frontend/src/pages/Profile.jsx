import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, ErrorBanner, SuccessBanner } from '../components/ui';

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const [form, setForm] = useState(null);
  const [savedMsg, setSavedMsg] = useState('');
  const [saveError, setSaveError] = useState('');

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');

  useEffect(() => {
    if (user) setForm({ firstName: user.first_name, lastName: user.last_name, designation: user.designation || '', phoneDialingCode: user.phone_dialing_code || '', phone: user.phone || '' });
  }, [user]);

  if (!form) return null;

  async function saveProfile(e) {
    e.preventDefault();
    setSavedMsg(''); setSaveError('');
    try {
      await api.patch(`/users/${user.id}`, form);
      await refreshUser();
      setSavedMsg('Profile updated.');
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Could not update profile');
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwMsg(''); setPwError('');
    if (pwForm.newPassword !== pwForm.confirm) return setPwError('New passwords do not match.');
    try {
      await api.patch('/users/me/password', { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      setPwMsg('Password changed.');
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setPwError(err.response?.data?.error || 'Could not change password');
    }
  }

  return (
    <div>
      <PageHeader title="My Profile" subtitle="Your identity across the portal — name, designation, email and phone." />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <h2>Profile details</h2>
          <ErrorBanner text={saveError} />
          <SuccessBanner text={savedMsg} />
          <form onSubmit={saveProfile} style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>First name</label>
                <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Last name</label>
                <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Designation</label>
              <input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Regional Sales Manager" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Email</label>
              <input value={user.email} disabled style={{ background: 'var(--ghost)', color: 'var(--gray-500)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 10 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Code</label>
                <input value={form.phoneDialingCode} onChange={(e) => setForm({ ...form, phoneDialingCode: e.target.value })} placeholder="+91" />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Phone</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <button className="btn btn-primary" type="submit" style={{ justifySelf: 'start' }}>Save changes</button>
          </form>
        </div>

        <div className="card">
          <h2>Change password</h2>
          <ErrorBanner text={pwError} />
          <SuccessBanner text={pwMsg} />
          <form onSubmit={changePassword} style={{ display: 'grid', gap: 10 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Current password</label>
              <input type="password" value={pwForm.currentPassword} onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} required />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>New password</label>
              <input type="password" value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} required minLength={8} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Confirm new password</label>
              <input type="password" value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} required minLength={8} />
            </div>
            <button className="btn btn-secondary" type="submit" style={{ justifySelf: 'start' }}>Change password</button>
          </form>
        </div>
      </div>
    </div>
  );
}
