/**
 * App shell — routes the 4 verification steps and renders the persistent
 * Stepper at the top. The actual state lives in `useIDVerification`
 * (zustand) so a full-page redirect through Signicat doesn't lose progress.
 */

import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';

import { CallbackHandler } from './components/CallbackHandler';
import { FaceMatch } from './components/FaceMatch';
import { IDVerificationResult } from './components/IDVerificationResult';
import { IDVerificationStart } from './components/IDVerificationStart';
import { Stepper } from './components/Stepper';
import { theme } from './lib/theme';
import { useIDVerification } from './hooks/useIDVerification';

function Shell({ children }: { children: React.ReactNode }) {
  const steps = useIDVerification((s) => s.steps);
  const { pathname } = useLocation();

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
          Signicat eID Hub · AWS Rekognition · HCS-U7
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
        {pathname !== '/callback' && <Stepper steps={steps} />}
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<IDVerificationStart />} />
          <Route path="/callback" element={<CallbackHandler />} />
          <Route path="/face-match" element={<FaceMatch />} />
          <Route path="/result" element={<IDVerificationResult />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
