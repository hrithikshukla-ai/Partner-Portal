import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import Logo from '../components/Logo';

const SSO_ERROR_MESSAGES = {
  no_account: 'No portal account found for that Google email — ask your administrator to create one first.',
  inactive_account: 'Your account is not active yet.',
  missing_code: 'Google sign-in was cancelled.',
  1: 'Google sign-in failed. Please try again or use your password.',
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    api.get('/auth/sso/status').then((res) => setGoogleEnabled(res.data.googleEnabled)).catch(() => {});
    const ssoError = searchParams.get('ssoError');
    if (ssoError) setError(SSO_ERROR_MESSAGES[ssoError] || 'Sign-in failed.');
  }, [searchParams]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--navy)',
    }}>
      <form onSubmit={handleSubmit} className="card" style={{ width: 360, background: 'white' }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Logo size={26} />
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)' }}>ACADEMIA</div>
          </div>
          <h1 style={{ marginTop: 10 }}>Partner Portal</h1>
          <p style={{ color: 'var(--gray-500)' }}>Sign in to manage your accounts, deals, and collateral.</p>
        </div>

        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>

        {error && (
          <div className="badge badge-conflict" style={{ display: 'block', marginBottom: 14, padding: '8px 10px' }}>
            {error}
          </div>
        )}

        <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        {googleEnabled && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0', color: 'var(--gray-500)', fontSize: 11 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--gray-200)' }} />
              or
              <div style={{ flex: 1, height: 1, background: 'var(--gray-200)' }} />
            </div>
            <a
              href="/api/auth/sso/google/login"
              className="btn btn-outline"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Sign in with Google
            </a>
          </>
        )}
      </form>
    </div>
  );
}
