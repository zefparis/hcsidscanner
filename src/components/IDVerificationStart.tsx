/**
 * Étape 1 — User taps "Verify my identity" and is redirected to the
 * Signicat hosted UI. Signicat handles MRZ scan + NFC chip read +
 * cryptographic signature verification natively.
 *
 * On native (Capacitor), the OIDC dance opens in a Custom Chrome Tab
 * (@capacitor/browser) — never an in-app WebView.
 */

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';

import { startAuth } from '../lib/signicat';
import { theme } from '../lib/theme';
import { useIDVerification } from '../hooks/useIDVerification';

export function IDVerificationStart() {
  const [busy, setBusy] = useState(false);
  const { setStep, setError, errorMessage, reset } = useIDVerification();

  const onClick = async () => {
    setBusy(true);
    setError(null);
    setStep('start', 'PROCESSING');
    try {
      // Top-level navigation (or Capacitor Browser on native). Signicat
      // blocks iframe embedding (X-Frame-Options / frame-ancestors), so a
      // full-page redirect is the only reliable approach on web.
      await startAuth();
      // Browser leaves the page from here on web; native users return
      // through the deep-link handler set up in CallbackHandler.
    } catch {
      setStep('start', 'FAILED');
      setError('Could not start verification. Please try again.');
      setBusy(false);
    }
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header>
        <p
          style={{
            margin: 0,
            color: theme.accent,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}
        >
          Step 1 — eID
        </p>
        <h1
          style={{
            margin: '8px 0 0',
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          Verify your identity
        </h1>
        <p
          style={{
            margin: '12px 0 0',
            color: theme.textMuted,
            lineHeight: 1.6,
            maxWidth: 520,
          }}
        >
          You'll be securely redirected to Signicat. Have your passport or
          national eID card ready — we'll read the MRZ, the NFC chip, and
          verify the issuing country's cryptographic signature.
        </p>
      </header>

      <ul
        style={{
          display: 'grid',
          gap: 10,
          padding: 0,
          margin: 0,
          listStyle: 'none',
          color: theme.text,
        }}
      >
        {[
          'Camera scan of the passport / ID page',
          'NFC chip read (ICAO 9303 — passport, eID)',
          'Cryptographic verification of the issuing country signature',
        ].map((line) => (
          <li
            key={line}
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              fontSize: 14,
            }}
          >
            <span
              style={{
                marginTop: 2,
                width: 6,
                height: 6,
                borderRadius: 999,
                background: theme.accent,
              }}
            />
            {line}
          </li>
        ))}
      </ul>

      {errorMessage && (
        <div
          role="alert"
          style={{
            padding: 12,
            borderRadius: 10,
            border: `1px solid ${theme.error}`,
            background: 'rgba(239, 68, 68, 0.08)',
            color: theme.error,
            fontSize: 13,
          }}
        >
          {errorMessage}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          type="button"
          onClick={onClick}
          disabled={busy}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            background: theme.accent,
            color: '#001620',
            border: 'none',
            borderRadius: 10,
            padding: '14px 22px',
            fontSize: 15,
            fontWeight: 700,
            cursor: busy ? 'progress' : 'pointer',
            opacity: busy ? 0.7 : 1,
          }}
        >
          <ShieldCheck size={18} />
          {busy ? 'Redirecting…' : 'Verify my identity'}
        </button>
        {errorMessage && (
          <button
            type="button"
            onClick={reset}
            style={{
              background: 'transparent',
              color: theme.textMuted,
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              padding: '14px 18px',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        )}
      </div>
    </section>
  );
}
