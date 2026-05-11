/**
 * Demo app — single-screen showcase of `@hcs/id-scanner-react`.
 *
 * The whole 3-step KYC pipeline is rendered by the `IDVerificationFlow`
 * component; we only provide the page chrome and forward the verdict to
 * the console (a real consumer would post it to its own backend).
 */

import { useState } from 'react';

import {
  IDVerificationFlow,
  theme,
  type IDVerificationResultData,
} from '@hcs/id-scanner-react';

const TENANT_ID =
  import.meta.env.VITE_HCS_TENANT_ID || 'hcs-id-scanner-demo';
const HCS_API_URL =
  import.meta.env.VITE_HCS_API_URL || 'https://hcs-u7-backend-kk0n.onrender.com';
const API_TOKEN = import.meta.env.VITE_API_TOKEN || '';

export default function App() {
  const [verdict, setVerdict] = useState<IDVerificationResultData | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: theme.bg,
        color: theme.text,
        fontFamily: theme.font,
      }}
    >
      <header
        style={{
          padding: '20px 24px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: theme.accent,
              boxShadow: `0 0 12px ${theme.accent}`,
            }}
          />
          <strong style={{ letterSpacing: '0.06em' }}>HCS ID SCANNER</strong>
        </div>
        <span style={{ color: theme.textMuted, fontSize: 12 }}>
          @hcs/id-scanner-react demo · MRZ + Face match · AWS Rekognition
        </span>
      </header>

      <main
        style={{
          maxWidth: 880,
          margin: '0 auto',
          padding: '28px 20px 80px',
          display: 'grid',
          gap: 24,
        }}
      >
        <IDVerificationFlow
          config={{
            tenantId: TENANT_ID,
            hcsApiUrl: HCS_API_URL,
            minFaceMatchScore: 80,
            requireFaceMatch: true,
            apiToken: API_TOKEN || undefined,
          }}
          onComplete={(result) => {
            // Real consumers would `await registerKyc(result)` here.
            // eslint-disable-next-line no-console
            console.log('[demo] verification complete', result);
            setVerdict(result);
          }}
          onError={(code) => setError(code)}
        />

        {verdict && (
          <pre
            style={{
              margin: 0,
              padding: 16,
              background: theme.bgCard,
              borderRadius: 12,
              border: `1px solid ${theme.border}`,
              fontSize: 12,
              color: theme.textMuted,
              overflowX: 'auto',
            }}
          >
            {JSON.stringify({ ...verdict, documentData: { ...verdict.documentData, rawMRZ: undefined } }, null, 2)}
          </pre>
        )}

        {error && (
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              border: `1px solid ${theme.error}`,
              background: 'rgba(239,68,68,0.08)',
              color: theme.error,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
      </main>
    </div>
  );
}
