import React from 'react';

export function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
      <div>
        <h1>{title}</h1>
        {subtitle && <p style={{ color: 'var(--gray-500)' }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, sub }) {
  return (
    <div className="card" style={{ flex: 1 }}>
      <h3>{label}</h3>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function StatRow({ children }) {
  return <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>{children}</div>;
}

export function TierBadge({ tier }) {
  return <span className={`badge badge-${(tier || '').toLowerCase()}`}>{tier}</span>;
}

export function EmptyState({ text }) {
  return (
    <div className="card" style={{ textAlign: 'center', color: 'var(--gray-500)', padding: 40 }}>
      {text}
    </div>
  );
}

export function Loading() {
  return <div style={{ padding: 20, fontSize: 12, color: 'var(--gray-500)' }}>Loading…</div>;
}

export function ErrorBanner({ text }) {
  if (!text) return null;
  return <div className="badge badge-conflict" style={{ display: 'block', padding: '8px 10px', marginBottom: 12 }}>{text}</div>;
}

export function SuccessBanner({ text }) {
  if (!text) return null;
  return <div className="badge badge-won" style={{ display: 'block', padding: '8px 10px', marginBottom: 12 }}>{text}</div>;
}

// Generic client-side search box — pairs with filterRows() below.
export function SearchBox({ value, onChange, placeholder }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || 'Search…'}
      style={{ maxWidth: 260 }}
    />
  );
}

export function filterRows(rows, query, keys) {
  if (!query || !query.trim()) return rows;
  const q = query.trim().toLowerCase();
  return rows.filter((row) =>
    keys.some((key) => String(row[key] ?? '').toLowerCase().includes(q))
  );
}

// Lightweight modal — used for Add/Edit forms across masters.
export function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(27,27,27,0.45)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '48px 16px', zIndex: 100, overflowY: 'auto',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card" style={{ width, background: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn btn-outline" style={{ padding: '4px 10px' }} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function IconButton({ label, onClick, children, active }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 34, height: 34, borderRadius: 8, border: '1px solid var(--gray-200)',
        background: active ? 'var(--navy-100)' : 'white', cursor: 'pointer', position: 'relative',
      }}
    >
      {children}
    </button>
  );
}
