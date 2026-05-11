/**
 * Étape 1 — Document scan (MRZ extraction).
 *
 * Captures a high-resolution frame from the webcam (or a file upload),
 * runs client-side quality checks (brightness, sharpness, size), then
 * sends it to /api/analyze-mrz for MRZ detection + parsing.
 *
 * Enhancements over naive capture:
 *  - HD camera constraints (1920×1080, continuous focus, rear camera)
 *  - Native-resolution canvas capture (no downscale)
 *  - Multi-frame stabilization (picks sharpest of 3)
 *  - Pre-flight quality gate (brightness, sharpness, dimensions)
 *  - Smart compression (> 5 MB → resize to 1600px + JPEG 0.85)
 *  - File upload fallback
 *  - Dev-only debug overlay (resolution, sharpness, brightness, size)
 *  - Mobile UX (touch-action: none, no scroll/zoom during capture)
 *
 * State machine: IDLE → STABILIZING → CAPTURING → ANALYZING → RESULT → ERROR
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import Webcam from 'react-webcam';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Upload,
} from 'lucide-react';

import { theme, STATUS_COLOR } from '../lib/theme';
import { ApiError, apiPost, useIDVerification } from '../hooks/useIDVerification';
import {
  captureStabilized,
  validateCapture,
  compressIfNeeded,
  getQualityReport,
  loadFileAsDataUrl,
  type QualityReport,
} from '../lib/capture-utils';
import { isDocumentUsableForSelfie } from '../lib/document-validation';
import type { DocumentData } from '@hcs/id-scanner-core';

// ─── Constants ───────────────────────────────────────────────────────────────

type ScannerState =
  | 'IDLE'
  | 'STABILIZING'
  | 'CAPTURING'
  | 'ANALYZING'
  | 'RESULT'
  | 'ERROR';

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: 'environment' },
  width: { ideal: 1920, min: 1280 },
  height: { ideal: 1080, min: 720 },
  // @ts-expect-error — focusMode is valid but not in all TS lib defs
  focusMode: { ideal: 'continuous' },
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_request: 'Invalid request.',
  invalid_input: 'The captured image could not be processed. Try again.',
  INVALID_IMAGE_PAYLOAD: 'Image payload is missing or malformed. Try capturing again.',
  no_mrz_found:
    'No MRZ band detected. Make sure the bottom of the document is in the frame and try again.',
  MRZ_NOT_DETECTED:
    'No MRZ band detected. Make sure the bottom of the document is in the frame and try again.',
  parse_failed:
    'Could not read the MRZ. Try better lighting and avoid glare on the document.',
  network_error: 'Network error. Check your connection and retry.',
  parse_error: 'Unexpected response from the server.',
  server_misconfigured: 'Server is not configured for MRZ analysis.',
  engine_unavailable: 'MRZ processing engine unavailable. Please try again later.',
  invalid_image_file: 'File is not a valid image. Use JPEG or PNG.',
  file_read_error: 'Could not read the file.',
};

const IS_DEV =
  typeof window !== 'undefined' &&
  (window.location?.hostname === 'localhost' ||
    window.location?.hostname === '127.0.0.1');

// ─── Main component ──────────────────────────────────────────────────────────

export function DocumentScanner() {
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    documentData,
    hcsApiUrl,
    apiToken,
    setDocumentData,
    setDocumentImage,
    setStep,
    setCurrentStep,
    reset,
  } = useIDVerification();

  const authHeaders = apiToken ? { 'x-api-key': apiToken } : undefined;

  const [state, setState] = useState<ScannerState>('IDLE');
  const [capture, setCapture] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<QualityReport | null>(null);
  const [analyzeStartTime, setAnalyzeStartTime] = useState<number>(0);

  // Lock body scroll only during the brief stabilization capture
  // (prevents accidental scroll while multi-frame capture runs).
  // NEVER lock during IDLE — the user needs to scroll to reach buttons.
  useEffect(() => {
    if (state === 'STABILIZING') {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [state]);

  // ─── Capture: multi-frame stabilized ───────────────────────────────────

  const onCapture = useCallback(async () => {
    const video = webcamRef.current?.video;
    if (!video) return;

    setState('STABILIZING');
    setErrorMessage(null);

    // Wait 300ms for stabilization, then capture 3 frames
    await new Promise((r) => setTimeout(r, 300));
    const result = await captureStabilized(video, 3, 120, 0.92);

    if (!result) {
      setErrorMessage('Capture failed. Make sure the camera is active.');
      setState('ERROR');
      return;
    }

    // Quality gate
    const qualityError = validateCapture(result.canvas);
    if (qualityError) {
      setErrorMessage(qualityError.message);
      setState('ERROR');
      return;
    }

    // Compress if needed
    const compressed = await compressIfNeeded(result.dataUrl);

    // Debug info (dev only)
    if (IS_DEV) {
      setDebugInfo(getQualityReport(result.canvas, compressed));
    }

    setCapture(compressed);
    setState('CAPTURING');
  }, []);

  // ─── File upload fallback ──────────────────────────────────────────────

  const onFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setErrorMessage(null);
      setState('STABILIZING');

      try {
        const dataUrl = await loadFileAsDataUrl(file, 1600, 0.92);
        setCapture(dataUrl);
        setState('CAPTURING');
      } catch (err) {
        const code = (err as Error).message;
        setErrorMessage(ERROR_MESSAGES[code] ?? 'Could not load file.');
        setState('ERROR');
      }

      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [],
  );

  // ─── Analyze ───────────────────────────────────────────────────────────

  const onAnalyze = useCallback(async () => {
    if (!capture) return;
    setState('ANALYZING');
    setStep('document', 'PROCESSING');
    setErrorMessage(null);
    setAnalyzeStartTime(Date.now());

    try {
      if (!hcsApiUrl) {
        throw new Error('hcsApiUrl is required');
      }
      const analyzeUrl = `${hcsApiUrl.replace(/\/$/, '')}/api/analyze-mrz`;
      if (IS_DEV) {
        // eslint-disable-next-line no-console
        console.log('[DocumentScanner] api url', analyzeUrl);
        // eslint-disable-next-line no-console
        console.log('[DocumentScanner] has api token', Boolean(apiToken));
      }
      const data = await apiPost<DocumentData>(
        analyzeUrl,
        { imageBase64: capture },
        undefined,
        authHeaders,
      );

      if (IS_DEV) {
        // eslint-disable-next-line no-console
        console.log(
          `[DocumentScanner] analyze took ${Date.now() - analyzeStartTime}ms`,
        );
      }

      setDocumentData(data);
      setDocumentImage(capture);
      const canContinueToSelfie = isDocumentUsableForSelfie(data);
      if (IS_DEV) {
        // eslint-disable-next-line no-console
        console.log('[DocumentScanner] documentData', data);
        // eslint-disable-next-line no-console
        console.log('[DocumentScanner] canContinueToSelfie', canContinueToSelfie);
      }
      if (!canContinueToSelfie || data.isExpired) {
        setStep('document', 'FAILED');
      } else {
        setStep('document', 'SUCCESS');
      }
      setState('RESULT');
    } catch (err) {
      const code = (err as Error).message;
      const serverMsg =
        err instanceof ApiError ? err.serverMessage : undefined;
      setErrorMessage(
        serverMsg || (ERROR_MESSAGES[code] ?? 'Document analysis failed.'),
      );
      setStep('document', 'FAILED');
      setState('ERROR');
    }
  }, [capture, hcsApiUrl, apiToken, setDocumentData, setDocumentImage, setStep, authHeaders, analyzeStartTime]);

  // ─── Retake ────────────────────────────────────────────────────────────

  const onRetake = useCallback(() => {
    setCapture(null);
    setDocumentData(null);
    setDocumentImage(null);
    setStep('document', 'PENDING');
    setErrorMessage(null);
    setDebugInfo(null);
    setState('IDLE');
  }, [setDocumentData, setDocumentImage, setStep]);

  const onContinue = useCallback(() => {
    setCurrentStep('FACE_MATCH');
  }, [setCurrentStep]);

  // ─── Render ────────────────────────────────────────────────────────────

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
          fileInputRef={fileInputRef}
          capture={capture}
          state={state}
          onCapture={onCapture}
          onAnalyze={onAnalyze}
          onRetake={onRetake}
          onFileUpload={onFileUpload}
          errorMessage={errorMessage}
          debugInfo={debugInfo}
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

// ─────────────────────────────────────────────────────────────────────────────
// Camera stage — webcam preview + MRZ guide + file upload + debug overlay
// ─────────────────────────────────────────────────────────────────────────────

interface CameraStageProps {
  webcamRef: React.RefObject<Webcam | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  capture: string | null;
  state: ScannerState;
  onCapture: () => void;
  onAnalyze: () => void;
  onRetake: () => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  errorMessage: string | null;
  debugInfo: QualityReport | null;
}

function CameraStage({
  webcamRef,
  fileInputRef,
  capture,
  state,
  onCapture,
  onAnalyze,
  onRetake,
  onFileUpload,
  errorMessage,
  debugInfo,
}: CameraStageProps) {
  const busy = state === 'ANALYZING' || state === 'STABILIZING';
  return (
    <div style={{ display: 'grid', gap: 14, paddingBottom: 96 }}>
      {/* Camera / preview container — prevent pinch-zoom on mobile */}
      <div
        style={{
          position: 'relative',
          background: '#000',
          borderRadius: 14,
          overflow: 'hidden',
          aspectRatio: '4 / 3',
          border: `1px solid ${theme.border}`,
          touchAction: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
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
            videoConstraints={VIDEO_CONSTRAINTS}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}

        {/* Guide overlay — only when live */}
        {!capture && <MrzGuideOverlay />}

        {/* Stabilizing indicator — pointerEvents:none so it never blocks */}
        {state === 'STABILIZING' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              background: 'rgba(5,12,20,0.45)',
              color: theme.text,
              fontSize: 14,
              gap: 8,
              pointerEvents: 'none',
            }}
          >
            <Loader2 size={24} className="hcs-spin" />
            <div style={{ fontWeight: 600 }}>Stabilizing…</div>
          </div>
        )}

        {/* Analyzing overlay — pointerEvents:none so it never blocks */}
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
              pointerEvents: 'none',
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

      {/* Instruction */}
      <p
        style={{
          margin: 0,
          color: theme.textMuted,
          textAlign: 'center',
          fontSize: 13,
        }}
      >
        Place the MRZ zone (bottom 2 lines) inside the highlighted area
      </p>

      {/* Debug overlay (dev only) */}
      {IS_DEV && debugInfo && (
        <div
          style={{
            padding: 8,
            borderRadius: 8,
            background: 'rgba(0,200,255,0.06)',
            border: `1px solid ${theme.border}`,
            fontSize: 11,
            fontFamily: 'monospace',
            color: theme.textMuted,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 4,
          }}
        >
          <span>📐 {debugInfo.width}×{debugInfo.height}</span>
          <span>☀️ brightness: {Math.round(debugInfo.brightness)}</span>
          <span>🔍 sharpness: {Math.round(debugInfo.sharpness)}</span>
          <span>💾 {(debugInfo.sizeBytes / 1024).toFixed(0)} KB</span>
        </div>
      )}

      {/* Error message */}
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

      {/* Actions — sticky so always reachable even on small viewports */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          zIndex: 50,
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          justifyContent: 'center',
          padding: '12px 0',
          background: theme.bg,
          pointerEvents: 'auto',
        }}
      >
        {!capture && (
          <>
            <button
              type="button"
              onClick={onCapture}
              disabled={busy}
              style={btnPrimary(busy)}
            >
              {busy ? (
                <Loader2 size={16} className="hcs-spin" />
              ) : (
                <Camera size={16} />
              )}
              {busy ? 'Capturing…' : 'Capture'}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              style={btnSecondary(busy)}
            >
              <Upload size={16} />
              Upload photo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              onChange={onFileUpload}
              style={{ display: 'none' }}
            />
          </>
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
              {state === 'ANALYZING' ? (
                <Loader2 size={16} className="hcs-spin" />
              ) : (
                <ShieldCheck size={16} />
              )}
              {state === 'ANALYZING' ? 'Analyzing…' : 'Analyze'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MRZ Guide Overlay — materialized MRZ zone with label
// ─────────────────────────────────────────────────────────────────────────────

function MrzGuideOverlay() {
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
            {/* Document area */}
            <rect
              x="7.5"
              y="12"
              width="85"
              height="51"
              rx="2.2"
              ry="2.2"
              fill="black"
            />
          </mask>
        </defs>
        {/* Dim area outside document */}
        <rect
          width="100"
          height="75"
          fill="rgba(5,12,20,0.55)"
          mask="url(#cutout)"
        />
        {/* Document border */}
        <rect
          x="7.5"
          y="12"
          width="85"
          height="51"
          rx="2.2"
          ry="2.2"
          fill="none"
          stroke="rgba(255,255,255,0.7)"
          strokeWidth="0.35"
        />
        {/* MRZ zone highlight (bottom ~25% of document area) */}
        <rect
          x="9"
          y="50"
          width="82"
          height="11.5"
          rx="1"
          ry="1"
          fill="rgba(0,200,255,0.08)"
          stroke={theme.accent}
          strokeWidth="0.4"
          strokeDasharray="1.5 0.8"
        />
        {/* MRZ zone label */}
        <text
          x="50"
          y="48.5"
          textAnchor="middle"
          fill={theme.accent}
          fontSize="2.8"
          fontFamily="system-ui, sans-serif"
          fontWeight="600"
        >
          ▼ MRZ ZONE ▼
        </text>
        {/* Corner accents */}
        {[
          { x: 7.5, y: 12, dx: 1, dy: 1 },
          { x: 92.5, y: 12, dx: -1, dy: 1 },
          { x: 7.5, y: 63, dx: 1, dy: -1 },
          { x: 92.5, y: 63, dx: -1, dy: -1 },
        ].map((c, i) => (
          <g key={i} stroke={theme.accent} strokeWidth="0.6">
            <line x1={c.x} y1={c.y} x2={c.x + c.dx * 4} y2={c.y} />
            <line x1={c.x} y1={c.y} x2={c.x} y2={c.y + c.dy * 3} />
          </g>
        ))}
      </svg>

      {/* Animated scan line in MRZ zone */}
      <div
        style={{
          position: 'absolute',
          left: '9%',
          right: '9%',
          top: '66.7%',
          height: '15.3%',
          pointerEvents: 'none',
          overflow: 'hidden',
          borderRadius: 4,
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
  const canContinueToSelfie =
    isDocumentUsableForSelfie(data) && !data.isExpired;
  const blocked = !canContinueToSelfie;
  const isPartial = !data.checkDigitsValid && canContinueToSelfie;

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

      {isPartial && (
        <div
          role="status"
          style={{
            padding: 14,
            borderRadius: 10,
            border: `1px solid ${theme.warning}`,
            background: 'rgba(245,158,11,0.08)',
            color: theme.warning,
            fontSize: 13,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>Partial — some check digits failed</strong>
            <br />
            You can continue, but this document may require manual review.
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
