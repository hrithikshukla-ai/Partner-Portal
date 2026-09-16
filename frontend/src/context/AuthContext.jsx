import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  function loadMe() {
    return api.get('/auth/me')
      .then((res) => { setUser(res.data); return res.data; })
      .catch(() => { localStorage.removeItem('app_token'); setUser(null); });
  }

  useEffect(() => {
    const token = localStorage.getItem('app_token');
    if (!token) { setLoading(false); return; }
    loadMe().finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('app_token', res.data.token);
    // /auth/login's payload uses camelCase (roleCode); every other page reads the
    // snake_case shape from /auth/me — fetch that immediately so role-based
    // routing (e.g. the Dashboard) works right after login, not just after a refresh.
    return loadMe();
  }

  // Used by the SSO callback page, which already has a server-issued token.
  async function loginWithToken(token) {
    localStorage.setItem('app_token', token);
    return loadMe();
  }

  function logout() {
    localStorage.removeItem('app_token');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithToken, logout, refreshUser: loadMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
