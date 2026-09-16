import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loading } from '../components/ui';

export default function SsoCallback() {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const match = window.location.hash.match(/token=([^&]+)/);
    if (!match) { setError('Missing sign-in token.'); return; }
    loginWithToken(decodeURIComponent(match[1])).then(() => navigate('/', { replace: true }));
  }, []);

  if (error) return <div style={{ padding: 40 }}>{error}</div>;
  return <Loading />;
}
