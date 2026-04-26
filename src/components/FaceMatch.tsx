/**
 * Étape 2 — Selfie + face match.
 *
 * Captures a live selfie and POSTs it together with the front-side document
 * photo (kept in the store from Étape 1) to /api/face-match, which calls
 * AWS Rekognition CompareFaces.
 *
 * Thresholds:
 *   ≥ 80%  → MATCH
 *   70-80% → REVIEW (soft warning, retry allowed)
 *   < 70%  → FAIL
 */

import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import { Camera, Loader2, RefreshCw } from 'lucide-react';

import { theme } from '../lib/theme';
import { apiPost, useIDVerification } from '../hooks/useIDVerification';
import type { FaceMatchResult } from '../types';

const MATCH_THRESHOLD = 80;
const REVIEW_THRESHOLD = 70;

const ERROR_MESSAGES: Record<string, string> = {
  invalid_request: 'Invalid request.',
  no_face_detected:
    'No face detected. Make sure your face is well-lit and centred.',
  network_error: 'Network error. Check your connection and retry.',
  parse_error: 'Unexpected response from the server.',
  server_misconfigured: 'Server is not configured for face matching.',
};

export function FaceMatch() {
  const navigate = useNavigate();
  const webcamRef = useRef<Webcam>(null);

  const {
    documentImageBase64,
    selfieBase64,
    setSelfie,
    faceMatchResult,
    setFaceMatchResult,
    setStep,
    setCurrentStep,
  } = useIDVerification();

  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Guard: if the user lands here without a document scan, send them back.
  if (!documentImageBase64) {
    navigate('/', { replace: true });
    return null;
  }

  const onCapture = useCallback(() => {
    const shot = webcamRef.current?.getScreenshot();
    if (shot) setSelfie(shot);
  }, [setSelfie]);

  const onSubmit = useCallback(async () => {
    if (!selfieBase64 || !documentImageBase64) return;
    setBusy(true);
    setErrorMessage(null);
    setStep('faceMatch', 'PROCESSING');
    try {
      const result = await apiPost<FaceMatchResult>('/api/face-match', {
        sourceImageBase64: selfieBase64,
        targetImageBase64: documentImageBase64,
      });
      setFaceMatchResult(result);
      if (result.similarity >= MATCH_THRESHOLD) {
        setStep('faceMatch', 'SUCCESS');
      } else {
        setStep('faceMatch', 'FAILED');
        setErrorMessage(
          result.similarity < REVIEW_THRESHOLD
            ? `Face match failed (${result.similarity.toFixed(1)}%). Please retry.`
            : `Borderline match (${result.similarity.toFixed(1)}%, threshold ${MATCH_THRESHOLD}%). Please retry.`,
        );
      }
    } catch (err) {
      setStep('faceMatch', 'FAILED');
      setErrorMessage(
        ERROR_MESSAGES[(err as Error).message] ?? 'Face match failed.',
      );
    } finally {
      setBusy(false);
    }
  }, [
    documentImageBase64,
    selfieBase64,
    setFaceMatchResult,
    setStep,
  ]);

  const onRetake = useCallback(() => {
    setSelfie(null);
    setFaceMatchResult(null);
    setErrorMessage(null);
    setStep('faceMatch', 'PENDING');
  }, [setFaceMatchResult, setSelfie, setStep]);

  const onContinue = useCallback(() => {
    setCurrentStep('RESULT');
    navigate('/result');
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
          Step 2 — Selfie
        </p>
        <h1 style={{ margin: '8px 0 0', fontSize: 26, fontWeight: 700 }}>
          Take a live selfie
        </h1>
        <p
          style={{
            margin: '10px 0 0',
            color: theme.textMuted,
            lineHeight: 1.6,
            maxWidth: 520,
            fontSize: 14,
          }}
        >
          We compare your selfie against the photo on the document you just
          scanned. Look straight into the camera and use good lighting.
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gap: 14,
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        }}
      >
        <div
          style={{
            position: 'relative',
            background: '#000',
            borderRadius: 14,
            overflow: 'hidden',
            aspectRatio: '3 / 4',
            border: `1px solid ${theme.border}`,
          }}
        >
          {selfieBase64 ? (
            <img
              src={selfieBase64}
              alt="Selfie preview"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <Webcam
              ref={webcamRef}
              audio={false}
              mirrored
              screenshotFormat="image/jpeg"
              videoConstraints={{ facingMode: 'user' }}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
          {!selfieBase64 && <FaceGuideOverlay />}
          <span
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              padding: '4px 8px',
              borderRadius: 999,
              background: 'rgba(0,0,0,0.55)',
              color: theme.text,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
            }}
          >
            LIVE SELFIE
          </span>
        </div>

        <div
          style={{
            position: 'relative',
            background: '#000',
            borderRadius: 14,
            overflow: 'hidden',
            aspectRatio: '3 / 4',
            border: `1px solid ${theme.border}`,
          }}
        >
          <img
            src={documentImageBase64}
            alt="Document"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <span
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              padding: '4px 8px',
              borderRadius: 999,
              background: 'rgba(0,0,0,0.55)',
              color: theme.text,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
            }}
          >
            DOCUMENT
          </span>
        </div>
      </div>

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

      {faceMatchResult && (
        <div
          style={{
            padding: 14,
            borderRadius: 10,
            border: `1px solid ${faceMatchResult.isMatch ? theme.success : theme.error}`,
            background: faceMatchResult.isMatch
              ? 'rgba(34,197,94,0.08)'
              : 'rgba(239,68,68,0.08)',
            color: faceMatchResult.isMatch ? theme.success : theme.error,
            fontSize: 14,
          }}
        >
          <strong style={{ fontWeight: 800 }}>
            {faceMatchResult.isMatch ? '✓ MATCH' : '✕ NO MATCH'}
          </strong>{' '}
          — similarity {faceMatchResult.similarity.toFixed(2)}%, confidence{' '}
          {faceMatchResult.confidence.toFixed(2)}% (threshold{' '}
          {faceMatchResult.threshold}%).
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {!selfieBase64 && (
          <button
            type="button"
            onClick={onCapture}
            disabled={busy}
            style={btnPrimary(busy)}
          >
            <Camera size={16} />
            Take selfie
          </button>
        )}
        {selfieBase64 && !faceMatchResult?.isMatch && (
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
              onClick={onSubmit}
              disabled={busy}
              style={btnPrimary(busy)}
            >
              {busy ? (
                <Loader2 size={16} className="hcs-spin" />
              ) : (
                <Camera size={16} />
              )}
              {busy ? 'Matching…' : 'Verify'}
            </button>
          </>
        )}
        {faceMatchResult?.isMatch && (
          <button type="button" onClick={onContinue} style={btnPrimary(false)}>
            Continue
          </button>
        )}
      </div>
    </section>
  );
}

function FaceGuideOverlay() {
  return (
    <svg
      viewBox="0 0 100 133.3"
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
        <mask id="face-cutout">
          <rect width="100" height="133.3" fill="white" />
          <ellipse cx="50" cy="60" rx="32" ry="42" fill="black" />
        </mask>
      </defs>
      <rect
        width="100"
        height="133.3"
        fill="rgba(5,12,20,0.5)"
        mask="url(#face-cutout)"
      />
      <ellipse
        cx="50"
        cy="60"
        rx="32"
        ry="42"
        fill="none"
        stroke={theme.accent}
        strokeWidth="0.5"
        strokeDasharray="2 2"
      />
    </svg>
  );
}

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
