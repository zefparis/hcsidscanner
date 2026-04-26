/**
 * Étape 1 — Document scan (MRZ extraction).
 *
 * Uses react-webcam to capture a frame, sends it to /api/analyze-mrz which
 * runs `mrz-detection` (image segmentation + OCR) followed by `mrz` parsing
 * with full check-digit validation.
 *
 * State machine: IDLE → CAPTURING → ANALYZING → RESULT → ERROR
 */

import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

import { theme, STATUS_COLOR } from '../lib/theme';
import { apiPost, useIDVerification } from '../hooks/useIDVerification';
import type { DocumentData } from '../types';

type ScannerState = 'IDLE' | 'CAPTURING' | 'ANALYZING' | 'RESULT' | 'ERROR';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_request: 'Invalid request.',
  no_mrz_found:
    'No MRZ band detected. Make sure the bottom of the document is in the frame and try again.',
  parse_failed:
    'Could not read the MRZ. Try better lighting and avoid glare on the document.',
  network_error: 'Network error. Check your connection and retry.',
  parse_error: 'Unexpected response from the server.',
  server_misconfigured: 'Server is not configured for MRZ analysis.',
};

export function DocumentScanner() {
  const navigate = useNavigate();
  const webcamRef = useRef<Webcam>(null);

  const {
    documentData,
    setDocumentData,
    setDocumentImage,
    setStep,
    setCurrentStep,
    reset,
  } = useIDVerification();

  const [state, setState] = useState<ScannerState>('IDLE');
  const [capture, setCapture] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onCapture = useCallback(() => {
    const shot = webcamRef.current?.getScreenshot();
    if (!shot) return;
    setCapture(shot);
    setState('CAPTURING');
    setErrorMessage(null);
  }, []);

  const onAnalyze = useCallback(async () => {
    if (!capture) return;
    setState('ANALYZING');
    setStep('document', 'PROCESSING');
    setErrorMessage(null);
    try {
      const data = await apiPost<DocumentData>('/api/analyze-mrz', {
        imageBase64: capture,
      });
      setDocumentData(data);
      setDocumentImage(capture);
      if (!data.checkDigitsValid || data.isExpired) {
        setStep('document', 'FAILED');
      } else {
        setStep('document', 'SUCCESS');
      }
      setState('RESULT');
    } catch (err) {
      const code = (err as Error).message;
      setErrorMessage(ERROR_MESSAGES[code] ?? 'Document analysis failed.');
      setStep('document', 'FAILED');
      setState('ERROR');
    }
  }, [capture, setDocumentData, setDocumentImage, setStep]);

  const onRetake = useCallback(() => {
    setCapture(null);
    setDocumentData(null);
    setDocumentImage(null);
    setStep('document', 'PENDING');
    setErrorMessage(null);
    setState('IDLE');
  }, [setDocumentData, setDocumentImage, setStep]);

  const onContinue = useCallback(() => {
    setCurrentStep('FACE_MATCH');
    navigate('/face-match');
  }, [navigate, setCurrentStep]);

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
          Step 1 — Document
        </p>
        <h1
          style={{
            margin: '8px 0 0',
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          Scan your ID document
        </h1>
        <p
          style={{
            margin: '10px 0 0',
            color: theme.textMuted,
            lineHeight: 1.6,
            maxWidth: 540,
            fontSize: 14,
          }}
        >
          Place the <strong>bottom</strong> of the document inside the frame —
          we read the MRZ band (the two lines of `&lt;` characters) and
          validate every check digit.
        </p>
      </header>

      {state !== 'RESULT' && (
        <CameraStage
          webcamRef={webcamRef}
          capture={capture}
          state={state}
          onCapture={onCapture}
          onAnalyze={onAnalyze}
          onRetake={onRetake}
          errorMessage={errorMessage}
        />
      )}

      {state === 'RESULT' && documentData && (
        <DocumentResult
          data={documentData}
          onContinue={onContinue}
          onRetake={() => {
            reset();
            onRetake();
          }}
        />
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Camera stage — webcam preview + MRZ guide overlay + capture preview
// ─────────────────────────────────────────────────────────────────────────

interface CameraStageProps {
  webcamRef: React.RefObject<Webcam | null>;
  capture: string | null;
  state: ScannerState;
  onCapture: () => void;
  onAnalyze: () => void;
  onRetake: () => void;
  errorMessage: string | null;
}

function CameraStage({
  webcamRef,
  capture,
  state,
  onCapture,
  onAnalyze,
  onRetake,
  errorMessage,
}: CameraStageProps) {
  const busy = state === 'ANALYZING';
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        style={{
          position: 'relative',
          background: '#000',
          borderRadius: 14,
          overflow: 'hidden',
          aspectRatio: '4 / 3',
          border: `1px solid ${theme.border}`,
        }}
      >
        {capture ? (
          <img
            src={capture}
            alt="Document capture"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            screenshotQuality={0.92}
            videoConstraints={{ facingMode: 'environment' }}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}

        {/* Guide overlay — only when live */}
        {!capture && <MrzGuideOverlay />}

        {capture && state === 'ANALYZING' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              background: 'rgba(5,12,20,0.55)',
              backdropFilter: 'blur(2px)',
              color: theme.text,
              fontSize: 14,
              gap: 10,
            }}
          >
            <Loader2 size={28} className="hcs-spin" />
            <div style={{ fontWeight: 600 }}>Reading MRZ…</div>
            <div style={{ color: theme.textMuted, fontSize: 12 }}>
              detecting band · OCR · validating check digits
            </div>
          </div>
        )}
      </div>

      <p
        style={{
          margin: 0,
          color: theme.textMuted,
          textAlign: 'center',
          fontSize: 13,
        }}
      >
        Place the bottom of the document inside the frame
      </p>

      {errorMessage && (
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
          {errorMessage}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {!capture && (
          <button type="button" onClick={onCapture} style={btnPrimary(busy)}>
            <Camera size={16} />
            Capture
          </button>
        )}
        {capture && (
          <>
            <button
              type="button"
              onClick={onRetake}
              disabled={busy}
              style={btnSecondary(busy)}
            >
              <RefreshCw size={16} />
              Retake
            </button>
            <button
              type="button"
              onClick={onAnalyze}
              disabled={busy}
              style={btnPrimary(busy)}
            >
              {busy ? (
                <Loader2 size={16} className="hcs-spin" />
              ) : (
                <ShieldCheck size={16} />
              )}
              {busy ? 'Analyzing…' : 'Analyze'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function MrzGuideOverlay() {
  // Guide rectangle: 85% width, 55% height, centred, with rounded corners
  // and an animated horizontal scan line.
  return (
    <>
      <svg
        viewBox="0 0 100 75"
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        <defs>
          <mask id="cutout">
            <rect width="100" height="75" fill="white" />
            <rect
              x="7.5"
              y="16.25"
              width="85"
              height="41.25"
              rx="2.2"
              ry="2.2"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100"
          height="75"
          fill="rgba(5,12,20,0.5)"
          mask="url(#cutout)"
        />
        <rect
          x="7.5"
          y="16.25"
          width="85"
          height="41.25"
          rx="2.2"
          ry="2.2"
          fill="none"
          stroke="rgba(255,255,255,0.85)"
          strokeWidth="0.4"
        />
        {/* Corner accents */}
        {[
          { x: 7.5, y: 16.25, dx: 1, dy: 1 },
          { x: 92.5, y: 16.25, dx: -1, dy: 1 },
          { x: 7.5, y: 57.5, dx: 1, dy: -1 },
          { x: 92.5, y: 57.5, dx: -1, dy: -1 },
        ].map((c, i) => (
          <g key={i} stroke={theme.accent} strokeWidth="0.6">
            <line x1={c.x} y1={c.y} x2={c.x + c.dx * 4} y2={c.y} />
            <line x1={c.x} y1={c.y} x2={c.x} y2={c.y + c.dy * 3} />
          </g>
        ))}
      </svg>

      {/* Animated scan line */}
      <div
        style={{
          position: 'absolute',
          left: '7.5%',
          right: '7.5%',
          top: '16.25%',
          bottom: '42.5%',
          pointerEvents: 'none',
          overflow: 'hidden',
          borderRadius: 6,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 2,
            background: `linear-gradient(90deg, transparent, ${theme.accent}, transparent)`,
            boxShadow: `0 0 12px ${theme.accent}`,
            animation: 'hcs-scan 2.4s cubic-bezier(.4,0,.4,1) infinite',
          }}
        />
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Result table
// ─────────────────────────────────────────────────────────────────────────

interface DocumentResultProps {
  data: DocumentData;
  onContinue: () => void;
  onRetake: () => void;
}

function DocumentResult({ data, onContinue, onRetake }: DocumentResultProps) {
  const blocked = data.isExpired || !data.checkDigitsValid;

  const rows: { label: string; value?: string }[] = [
    { label: 'First name', value: data.firstName },
    { label: 'Last name', value: data.lastName },
    { label: 'Date of birth', value: data.dateOfBirth },
    { label: 'Sex', value: data.sex },
    { label: 'Nationality', value: data.nationality },
    { label: 'Document type', value: data.documentType },
    { label: 'Document number', value: data.documentNumber },
    { label: 'Issuing country', value: data.issuingCountry },
    { label: 'Expiration', value: data.expirationDate },
  ];

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <ConfidenceBadge
        valid={data.checkDigitsValid}
        expired={data.isExpired}
      />

      {data.isExpired && (
        <div
          role="alert"
          style={{
            padding: 14,
            borderRadius: 10,
            border: `1px solid ${theme.error}`,
            background: 'rgba(239,68,68,0.08)',
            color: theme.error,
            fontSize: 13,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>Document expired</strong> — expired on{' '}
            {data.expirationDate}. Please use a valid document.
          </span>
        </div>
      )}

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
              {r.value || <span style={{ color: theme.textMuted }}>—</span>}
            </dd>
          </div>
        ))}
      </dl>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={onRetake} style={btnSecondary(false)}>
          <RefreshCw size={16} />
          Scan again
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={blocked}
          style={btnPrimary(blocked)}
        >
          <ShieldCheck size={16} />
          Continue to selfie
        </button>
      </div>
    </div>
  );
}

function ConfidenceBadge({
  valid,
  expired,
}: {
  valid: boolean;
  expired: boolean;
}) {
  const status = expired ? 'FAILED' : valid ? 'SUCCESS' : 'PROCESSING';
  const color = STATUS_COLOR[status];
  const label = expired
    ? 'Expired'
    : valid
      ? 'Check digits valid'
      : 'Partial — some check digits failed';
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 999,
        border: `1px solid ${color}`,
        background: 'rgba(0,200,255,0.06)',
        color,
        fontSize: 12,
        fontWeight: 700,
        width: 'fit-content',
        letterSpacing: '0.04em',
      }}
    >
      <CheckCircle2 size={14} />
      {label}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Buttons
// ─────────────────────────────────────────────────────────────────────────

function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: theme.accent,
    color: '#001620',
    border: 'none',
    borderRadius: 10,
    padding: '12px 20px',
    fontSize: 14,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  };
}

function btnSecondary(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: 'transparent',
    color: theme.text,
    border: `1px solid ${theme.border}`,
    borderRadius: 10,
    padding: '12px 18px',
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  };
}
