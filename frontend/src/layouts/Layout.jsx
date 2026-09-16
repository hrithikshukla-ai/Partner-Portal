import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { visibleNav } from '../nav';
import api from '../services/api';
import Logo from '../components/Logo';

const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  GLOBAL_PARTNER_MANAGER: 'Global Partner Manager',
  REGIONAL_PARTNER_MANAGER: 'Regional Partner Manager',
  PARTNER_ADMIN: 'Partner Admin',
  PARTNER_SALES_USER: 'Partner Sales User',
  ACADEMIA_MARKETING: 'Academia Marketing',
  ACADEMIA_SALES: 'Academia Sales / Account Manager',
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const items = visibleNav(user?.role_code);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const notifRef = useRef(null);
  const profileRef = useRef(null);

  useEffect(() => {
    api.get('/notifications').then((res) => setNotifications(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    function onClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  async function markRead(id) {
    await api.patch(`/notifications/${id}/read`);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 232, background: 'var(--navy)', color: 'white',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        <div style={{ padding: '20px 20px 18px', borderBottom: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo size={30} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em' }}>ACADEMIA</div>
            <div style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3,
              color: 'var(--navy)', background: 'white', display: 'inline-block', padding: '1px 7px', borderRadius: 4,
            }}>
              Partner Portal
            </div>
          </div>
        </div>
        <nav style={{ padding: '14px 10px', flex: 1 }}>
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              style={({ isActive }) => ({
                display: 'block',
                padding: '9px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 2,
                color: isActive ? 'var(--navy)' : 'rgba(255,255,255,0.85)',
                background: isActive ? 'white' : 'transparent',
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: 16, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{user?.first_name} {user?.last_name}</div>
          <div style={{ fontSize: 10, opacity: 0.65, marginBottom: 10 }}>{ROLE_LABELS[user?.role_code] || user?.role_code}</div>
          <button
            className="btn btn-outline"
            style={{ width: '100%', color: 'white', borderColor: 'rgba(255,255,255,0.25)' }}
            onClick={() => { logout(); navigate('/login'); }}
          >
            Log out
          </button>
        </div>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header style={{
          height: 56, background: 'white', borderBottom: '1px solid var(--gray-200)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px',
        }}>
          <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>
            {user?.region_id ? 'Region-scoped view' : user?.partner_id ? 'Partner view' : 'Global view'}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div ref={notifRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setNotifOpen((v) => !v)}
                title="Notifications"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34,
                  borderRadius: 8, border: '1px solid var(--gray-200)', background: notifOpen ? 'var(--navy-100)' : 'white',
                  cursor: 'pointer', position: 'relative', fontSize: 15,
                }}
              >
                🔔
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: -3, right: -3, background: 'var(--crimson)', color: 'white',
                    fontSize: 9, fontWeight: 700, borderRadius: 999, minWidth: 15, height: 15, padding: '0 3px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {unreadCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="card" style={{ position: 'absolute', right: 0, top: 42, width: 320, padding: 0, maxHeight: 360, overflowY: 'auto', zIndex: 50 }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: 16, color: 'var(--gray-500)' }}>You're all caught up.</div>
                  ) : notifications.slice(0, 8).map((n) => (
                    <div key={n.id} style={{ padding: 12, borderBottom: '1px solid var(--gray-200)', background: n.is_read ? 'transparent' : 'var(--navy-100)' }}>
                      <div style={{ fontWeight: 700 }}>{n.title}</div>
                      <div style={{ color: 'var(--gray-500)', fontSize: 11 }}>{n.body}</div>
                      {!n.is_read && (
                        <button className="btn btn-outline" style={{ marginTop: 6, padding: '2px 8px', fontSize: 10 }} onClick={() => markRead(n.id)}>Mark read</button>
                      )}
                    </div>
                  ))}
                  <NavLink to="/notifications" style={{ display: 'block', textAlign: 'center', padding: 10, fontWeight: 700, color: 'var(--navy)' }} onClick={() => setNotifOpen(false)}>
                    View all
                  </NavLink>
                </div>
              )}
            </div>

            <div ref={profileRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setProfileOpen((v) => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px 4px 4px', borderRadius: 20,
                  border: '1px solid var(--gray-200)', background: profileOpen ? 'var(--navy-100)' : 'white', cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 26, height: 26, borderRadius: '50%', background: 'var(--navy)', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                }}>
                  {(user?.first_name || '?')[0]}{(user?.last_name || '')[0]}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{user?.first_name}</span>
              </button>
              {profileOpen && (
                <div className="card" style={{ position: 'absolute', right: 0, top: 42, width: 200, padding: 8, zIndex: 50 }}>
                  <div style={{ padding: '6px 8px 10px', borderBottom: '1px solid var(--gray-200)', marginBottom: 6 }}>
                    <div style={{ fontWeight: 700 }}>{user?.first_name} {user?.last_name}</div>
                    <div style={{ color: 'var(--gray-500)', fontSize: 10 }}>{user?.email}</div>
                  </div>
                  <NavLink to="/profile" style={{ display: 'block', padding: '8px', borderRadius: 6, fontWeight: 600 }} onClick={() => setProfileOpen(false)}>
                    My profile
                  </NavLink>
                  <button
                    className="btn btn-outline"
                    style={{ width: '100%', marginTop: 6 }}
                    onClick={() => { logout(); navigate('/login'); }}
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main style={{ flex: 1, padding: 28, maxWidth: 1240 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
