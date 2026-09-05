'use client';

import * as React from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          fontFamily: 'system-ui, sans-serif',
          background: '#09090b',
          color: '#fafafa',
        }}>
          <section style={{ maxWidth: '520px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '28px', marginBottom: '12px' }}>OXSIG hit an unexpected error</h1>
            <p style={{ color: '#a1a1aa', lineHeight: 1.6, marginBottom: '20px' }}>
              The failure has been captured when production monitoring is configured. You can retry this screen without losing persisted account data.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                border: 0,
                borderRadius: '8px',
                padding: '10px 16px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
