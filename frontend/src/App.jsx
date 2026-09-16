import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Activate from './pages/Activate';
import SsoCallback from './pages/SsoCallback';
import Dashboard from './pages/Dashboard';
import { PartnersList, PartnerDetail } from './pages/Partners';
import Hierarchy from './pages/Hierarchy';
import { InstitutesList, InstituteDetail } from './pages/Institutes';
import Deals from './pages/Deals';
import Collateral from './pages/Collateral';
import Cadence from './pages/Cadence';
import Training from './pages/Training';
import Notifications from './pages/Notifications';
import Incentives from './pages/Incentives';
import Users from './pages/Users';
import Profile from './pages/Profile';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/activate" element={<Activate />} />
      <Route path="/sso-callback" element={<SsoCallback />} />

      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/partners" element={<ProtectedRoute><PartnersList /></ProtectedRoute>} />
      <Route path="/partners/:id" element={<ProtectedRoute><PartnerDetail /></ProtectedRoute>} />
      <Route path="/hierarchy" element={<ProtectedRoute><Hierarchy /></ProtectedRoute>} />
      <Route path="/institutes" element={<ProtectedRoute><InstitutesList /></ProtectedRoute>} />
      <Route path="/institutes/:id" element={<ProtectedRoute><InstituteDetail /></ProtectedRoute>} />
      <Route path="/deals" element={<ProtectedRoute><Deals /></ProtectedRoute>} />
      <Route path="/collateral" element={<ProtectedRoute><Collateral /></ProtectedRoute>} />
      <Route path="/cadence" element={<ProtectedRoute><Cadence /></ProtectedRoute>} />
      <Route path="/training" element={<ProtectedRoute><Training /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
      <Route path="/incentives" element={<ProtectedRoute><Incentives /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

      <Route path="*" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
    </Routes>
  );
}
