/**
 * Étape 3 — Recap + register the KYC verdict in HCS-U7.
 *
 * KYC composite score:
 *   mrz_valid * 0.6  +  face_match_similarity / 100 * 0.4
 *
 *   mrz_valid = 1.0 if checkDigitsValid && !isExpired, else 0.5.
 *
 * The raw document image is *not* sent to HCS-U7 — only the structured
 * payload (parsed MRZ data + face match score + composite KYC score).
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';

import { theme, STATUS_COLOR } from '../lib/theme';
import { useIDVerification } from '../hooks/useIDVerification';
import type { KycRegistrationPayload, StepStatus } from '../types';

const HCS_API_URL =
  import.meta.env.VITE_HCS_API_URL ||
  'https://hcs-u7-backend-kk0n.onrender.com';
const TENANT_ID =
  import.meta.env.VITE_HCS_TENANT_ID || 'hcs-id-scanner-demo';

export function IDVerificationResult() {
  const {
    steps,
    documentData,
    faceMatchResult,
    setStep,
    setKycScore,
  } = useIDVerification();

  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState<{
    employeeId?: string;
    error?: string;
  } | null>(null);

  const composite = useMemo(() => {
    if (!documentData || !faceMatchResult) return 0;
    const mrzPart =
      documentData.checkDigitsValid && !documentData.isExpired ? 1.0 : 0.5;
    const facePart = faceMatchResult.similarity / 100;
    return Math.round((mrzPart * 0.6 + facePart * 0.4) * 100);
  }, [documentData, faceMatchResult]);

  // Push the score back into the store so callers can inspect it.
  useEffect(() => {
    setKycScore(composite);
  }, [composite, setKycScore]);

  const ready =
    steps.document === 'SUCCESS' &&
    steps.faceMatch === 'SUCCESS' &&
    documentData &&
    faceMatchResult;

  async function register() {
    if (!ready) return;
    setBusy(true);
    setStep('result', 'PROCESSING');

    // Strip the rawMRZ before leaving the device.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { rawMRZ: _rawMRZ, ...documentForBackend } = documentData;

    const payload: KycRegistrationPayload = {
      documentData: documentForBackend,
      faceMatchScore: faceMatchResult.similarity,
      kycScore: composite,
      timestamp: new Date().toISOString(),
      tenantId: TENANT_ID,
    };

    try {
      const res = await fetch(`${HCS_API_URL}/api/kyc/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`http_${res.status}`);
      }
      const data = (await res.json().catch(() => ({}))) as {
        employeeId?: string;
      };
      setStep('result', 'SUCCESS');
      setRegistered({ employeeId: data.employeeId });
    } catch (err) {
      setStep('result', 'FAILED');
      setRegistered({ error: (err as Error).message || 'register_failed' });
    } finally {
      setBusy(false);
    }
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
          Step 3 — Verdict
        </p>
        <h1 style={{ margin: '8px 0 0', fontSize: 26, fontWeight: 700 }}>
          KYC verdict
        </h1>
      </header>

      <div
        style={{
          display: 'grid',
          gap: 12,
          padding: 18,
          borderRadius: 12,
          background: theme.bgCard,
          border: `1px solid ${theme.border}`,
        }}
      >
        <RecapRow label="Document MRZ valid" status={steps.document} />
        <RecapRow label="Live face match" status={steps.faceMatch} />
        <hr
          style={{
            margin: 0,
            border: 0,
            borderTop: `1px solid ${theme.border}`,
          }}
        />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ color: theme.textMuted, fontSize: 12 }}>
            COMPOSITE KYC SCORE
          </span>
          <span
            style={{
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 28,
              fontWeight: 800,
              color: composite >= 80 ? theme.success : theme.warning,
            }}
          >
            {composite}/100
          </span>
        </div>
      </div>

      {registered?.error && (
        <div
          role="alert"
          style={{
            padding: 12,
            borderRadius: 10,
            border: `1px solid ${theme.error}`,
            background: 'rgba(239,68,68,0.08)',
            color: theme.error,
            fontSize: 13,
          }}
        >
          Registration failed: {registered.error}.
        </div>
      )}

      {registered?.employeeId && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 999,
            border: `1px solid ${theme.success}`,
            background: 'rgba(34,197,94,0.08)',
            color: theme.success,
            fontSize: 13,
            fontWeight: 700,
            width: 'fit-content',
          }}
        >
          <ShieldCheck size={14} />
          Registered in HCS-U7 — id {registered.employeeId}
        </div>
      )}

      <button
        type="button"
        onClick={register}
        disabled={!ready || busy || registered?.employeeId !== undefined}
        style={{
          justifySelf: 'start',
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
          cursor: !ready || busy ? 'not-allowed' : 'pointer',
          opacity: !ready || busy ? 0.65 : 1,
        }}
      >
        {busy ? (
          <Loader2 size={16} className="hcs-spin" />
        ) : (
          <ShieldCheck size={16} />
        )}
        {registered?.employeeId
          ? 'Registered'
          : busy
            ? 'Registering…'
            : 'Register in HCS-U7'}
      </button>
    </section>
  );
}

function RecapRow({ label, status }: { label: string; status: StepStatus }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <span style={{ color: theme.text, fontSize: 14 }}>{label}</span>
      <span
        style={{
          padding: '3px 10px',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.06em',
          color: STATUS_COLOR[status],
          border: `1px solid ${STATUS_COLOR[status]}`,
        }}
      >
        {status}
      </span>
    </div>
  );
}
