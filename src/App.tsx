/**
 * App shell — routes the 3 verification steps, in-app, no external redirect.
 */

import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';

import { DocumentScanner } from './components/DocumentScanner';
import { FaceMatch } from './components/FaceMatch';
import { IDVerificationResult } from './components/IDVerificationResult';
import { Stepper } from './components/Stepper';
import { theme } from './lib/theme';
import { useIDVerification } from './hooks/useIDVerification';

function Shell({ children }: { children: React.ReactNode }) {
  const steps = useIDVerification((s) => s.steps);

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
          MRZ + Face match · 100% in-app · AWS Rekognition
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
        <Stepper steps={steps} />
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
          <Route path="/" element={<DocumentScanner />} />
          <Route path="/face-match" element={<FaceMatch />} />
          <Route path="/result" element={<IDVerificationResult />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
