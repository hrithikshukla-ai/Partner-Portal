import React from 'react';

// Placeholder wordmark built from the BRD's brand tokens (Midnight Navy / Crimson Red) until a
// real Academia logo asset is supplied — swap the <svg> below for an <img src="/logo.svg" /> then.
export default function Logo({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Academia">
      <rect width="40" height="40" rx="9" fill="#2A2C5B" />
      <path d="M20 9L32 30H26.5L20 18.5L13.5 30H8L20 9Z" fill="white" />
      <rect x="17" y="26" width="6" height="4" rx="1" fill="#B2242E" />
    </svg>
  );
}
