import React from 'react';

export function Github({ size = 24, className = '', ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

export function Slack({ size = 24, className = '', ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <rect width="3" height="8" x="13" y="2" rx="1.5"/>
      <path d="M19 10a2.5 2.5 0 0 1-2.5 2.5H13V10a2.5 2.5 0 0 1 2.5-2.5h1A2.5 2.5 0 0 1 19 10z"/>
      <rect width="8" height="3" x="13" y="13" rx="1.5"/>
      <path d="M14 19a2.5 2.5 0 0 1-2.5-2.5V13h2.5a2.5 2.5 0 0 1 2.5 2.5v1a2.5 2.5 0 0 1-2.5 2.5z"/>
      <rect width="3" height="8" x="8" y="14" rx="1.5"/>
      <path d="M5 14a2.5 2.5 0 0 1 2.5-2.5H11v2.5A2.5 2.5 0 0 1 8.5 14.5h-1A2.5 2.5 0 0 1 5 14z"/>
      <rect width="8" height="3" x="3" y="8" rx="1.5"/>
      <path d="M10 5a2.5 2.5 0 0 1 2.5 2.5V11H10A2.5 2.5 0 0 1 7.5 8.5v-1A2.5 2.5 0 0 1 10 5z"/>
    </svg>
  );
}
