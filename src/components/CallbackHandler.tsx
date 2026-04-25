/**
 * Étape 2 — OIDC callback.
 *
 * Signicat redirects back here with `?code=…&state=…`. We forward those
 * (plus the PKCE verifier the browser kept in sessionStorage) to our own
 * /api/token-exchange, which performs the confidential-client exchange
 * server-side and returns curated claims.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';

import {
  consumeExpectedState,
  consumePkceVerifier,
  SIGNICAT,
} from '../lib/signicat';
import { theme } from '../lib/theme';
import { apiPost, useIDVerification } from '../hooks/useIDVerification';
import type { SignicatClaims } from '../types';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_request: 'Invalid verification response.',
  state_mismatch: 'Security check failed (state mismatch). Please retry.',
  missing_code: 'No verification code returned.',
  token_exchange_failed: 'Could not validate your identity.',
  userinfo_failed: 'Could not retrieve your verified data.',
  network_error: 'Network error. Check your connection and retry.',
  parse_error: 'Unexpected response from the server.',
};

export function CallbackHandler() {
  const navigate = useNavigate();
  const { setStep, setClaims, setError, claims } = useIDVerification();
  const [internalError, setInternalError] = useState<string | null>(null);
  // Avoid double-execution under React strict mode.
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const oidcError = params.get('error');

    setStep('callback', 'PROCESSING');

    if (oidcError) {
      setStep('start', 'FAILED');
      setError('Verification was cancelled or denied.');
      navigate('/', { replace: true });
      return;
    }

    const expectedState = consumeExpectedState();
    const verifier = consumePkceVerifier();

    if (!code) {
      setInternalError(ERROR_MESSAGES.missing_code);
      setStep('callback', 'FAILED');
      return;
    }
    if (!verifier) {
      setInternalError(ERROR_MESSAGES.invalid_request);
      setStep('callback', 'FAILED');
      return;
    }
    if (expectedState && state && expectedState !== state) {
      setInternalError(ERROR_MESSAGES.state_mismatch);
      setStep('callback', 'FAILED');
      return;
    }

    apiPost<{ claims: SignicatClaims }>('/api/token-exchange', {
      code,
      redirect_uri: SIGNICAT.redirectUri,
      code_verifier: verifier,
    })
      .then(({ claims }) => {
        setClaims(claims);
        setStep('start', 'SUCCESS');
        setStep('callback', 'SUCCESS');
        // Clean up the URL so a refresh doesn't re-attempt the exchange.
        window.history.replaceState({}, '', '/callback');
      })
      .catch((err: Error) => {
        const code = err.message;
        setInternalError(ERROR_MESSAGES[code] ?? 'Verification failed.');
        setStep('callback', 'FAILED');
      });
  }, [navigate, setClaims, setError, setStep]);

  if (internalError) {
    return (
      <section style={{ display: 'grid', gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
          We couldn't verify your identity
        </h1>
        <div
          role="alert"
          style={{
            padding: 14,
            borderRadius: 10,
            border: `1px solid ${theme.error}`,
            background: 'rgba(239, 68, 68, 0.08)',
            color: theme.error,
            fontSize: 14,
          }}
        >
          {internalError}
        </div>
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          style={{
            justifySelf: 'start',
            background: theme.accent,
            color: '#001620',
            border: 'none',
            borderRadius: 10,
            padding: '12px 18px',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </section>
    );
  }

  if (!claims) {
    return (
      <section
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          color: theme.textMuted,
          fontSize: 14,
        }}
      >
        <Loader2 size={16} className="hcs-spin" />
        Validating verification…
      </section>
    );
  }

  return (
    <section style={{ display: 'grid', gap: 18 }}>
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
          Step 2 — Verified data
        </p>
        <h1 style={{ margin: '8px 0 0', fontSize: 24, fontWeight: 700 }}>
          Identity verified
        </h1>
      </header>

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderRadius: 999,
          border: `1px solid ${theme.success}`,
          background: 'rgba(34,197,94,0.08)',
          color: theme.success,
          fontSize: 12,
          fontWeight: 700,
          width: 'fit-content',
          letterSpacing: '0.04em',
        }}
      >
        <CheckCircle2 size={14} />
        Identity verified — signed by Signicat
      </div>

      <ClaimsTable claims={claims} />

      <button
        type="button"
        onClick={() => navigate('/face-match')}
        style={{
          justifySelf: 'start',
          background: theme.accent,
          color: '#001620',
          border: 'none',
          borderRadius: 10,
          padding: '14px 22px',
          fontSize: 15,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Continue to face match
      </button>
    </section>
  );
}

function ClaimsTable({ claims }: { claims: SignicatClaims }) {
  const rows: { label: string; value?: string }[] = [
    { label: 'Given name', value: claims.given_name },
    { label: 'Family name', value: claims.family_name },
    { label: 'Birthdate', value: claims.birthdate },
    { label: 'Nationality', value: claims.nationality },
    { label: 'Document type', value: claims.document_type },
    { label: 'Document number', value: claims.document_number },
    { label: 'Expiry date', value: claims.expiry_date },
  ];
  return (
    <dl
      style={{
        margin: 0,
        display: 'grid',
        gridTemplateColumns: 'minmax(140px,200px) 1fr',
        rowGap: 10,
        columnGap: 12,
        padding: 16,
        background: theme.bgCard,
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        fontSize: 14,
      }}
    >
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'contents' }}>
          <dt style={{ color: theme.textMuted, fontSize: 12 }}>
            {r.label.toUpperCase()}
          </dt>
          <dd style={{ margin: 0, color: theme.text, fontWeight: 500 }}>
            {r.value ?? <span style={{ color: theme.textMuted }}>—</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
