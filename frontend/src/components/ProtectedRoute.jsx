import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Layout from '../layouts/Layout';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <div style={{ padding: 40, fontSize: 12 }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;

  return <Layout>{children}</Layout>;
}
