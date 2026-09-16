import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Logo from '../components/Logo';

export default function Activate() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setSubmitting(true);
    try {
      await api.post('/users/activate', { token, password });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not activate this account');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)' }}>
      <div className="card" style={{ width: 360, background: 'white' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <Logo size={26} />
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)' }}>ACADEMIA</div>
        </div>

        {done ? (
          <>
            <h1>You're all set</h1>
            <p style={{ color: 'var(--gray-500)', marginBottom: 16 }}>Your account is active. Sign in with your new password.</p>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/login')}>Go to sign in</button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <h1>Set your password</h1>
            <p style={{ color: 'var(--gray-500)', marginBottom: 16 }}>One step to activate your Academia Partner Portal account.</p>
            <div className="field">
              <label>New password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
            </div>
            <div className="field">
              <label>Confirm password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            {error && <div className="badge badge-conflict" style={{ display: 'block', marginBottom: 14, padding: '8px 10px' }}>{error}</div>}
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={submitting}>
              {submitting ? 'Activating…' : 'Activate account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
