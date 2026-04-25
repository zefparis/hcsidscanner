/**
 * Étape 3 — Face match.
 *
 * Capture a live selfie via react-webcam, POST it (along with the chip
 * portrait kept in the in-memory store) to /api/face-match, render the
 * Rekognition CompareFaces verdict.
 *
 * Threshold = 90% similarity (Signicat-grade). < 70% = explicit failure.
 */

import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import { Camera, Loader2, RefreshCw } from 'lucide-react';

import { theme } from '../lib/theme';
import { apiPost, useIDVerification } from '../hooks/useIDVerification';
import type { FaceMatchResult } from '../types';

const HARD_FAIL_THRESHOLD = 70;

export function FaceMatch() {
  const navigate = useNavigate();
  const webcamRef = useRef<Webcam>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { claims, faceMatch, setFaceMatch, setStep } = useIDVerification();

  const capture = useCallback(() => {
    const shot = webcamRef.current?.getScreenshot();
    if (shot) setSelfie(shot);
  }, []);

  const submit = useCallback(async () => {
    if (!selfie || !claims?.portrait) {
      setErrorMessage(
        !claims?.portrait
          ? 'Missing chip portrait. Restart verification.'
          : 'Take a selfie first.',
      );
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    setStep('faceMatch', 'PROCESSING');
    try {
      const result = await apiPost<FaceMatchResult>('/api/face-match', {
        sourceImageBase64: selfie,
        targetImageBase64: claims.portrait,
      });
      setFaceMatch(result);
      if (result.isMatch) {
        setStep('faceMatch', 'SUCCESS');
      } else if (result.similarity < HARD_FAIL_THRESHOLD) {
        setStep('faceMatch', 'FAILED');
        setErrorMessage(
          `Face match failed (${result.similarity.toFixed(1)}%). Please retry.`,
        );
      } else {
        // Borderline — surfaces as a warning the user can retry.
        setStep('faceMatch', 'FAILED');
        setErrorMessage(
          `Match too low (${result.similarity.toFixed(1)}%, threshold ${result.threshold}%).`,
        );
      }
    } catch (err) {
      setStep('faceMatch', 'FAILED');
      setErrorMessage(
        (err as Error).message === 'network_error'
          ? 'Network error during face match.'
          : 'Face match failed. Please retry.',
      );
    } finally {
      setBusy(false);
    }
  }, [claims?.portrait, selfie, setFaceMatch, setStep]);

  if (!claims) {
    return <Redirect to="/" />;
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
          Step 3 — Face match
        </p>
        <h1 style={{ margin: '8px 0 0', fontSize: 24, fontWeight: 700 }}>
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
          We compare your selfie against the photo extracted from your
          document's NFC chip (DG2). Aim for good lighting and look straight
          into the camera.
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
            borderRadius: 12,
            overflow: 'hidden',
            aspectRatio: '3 / 4',
            border: `1px solid ${theme.border}`,
          }}
        >
          {selfie ? (
            // eslint-disable-next-line jsx-a11y/img-redundant-alt
            <img
              src={selfie}
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

        {claims.portrait && (
          <div
            style={{
              position: 'relative',
              background: '#000',
              borderRadius: 12,
              overflow: 'hidden',
              aspectRatio: '3 / 4',
              border: `1px solid ${theme.border}`,
            }}
          >
            <img
              src={
                claims.portrait.startsWith('data:')
                  ? claims.portrait
                  : `data:image/jpeg;base64,${claims.portrait}`
              }
              alt="Chip portrait"
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
              CHIP PORTRAIT
            </span>
          </div>
        )}
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

      {faceMatch && (
        <div
          style={{
            padding: 14,
            borderRadius: 10,
            border: `1px solid ${faceMatch.isMatch ? theme.success : theme.error}`,
            background: faceMatch.isMatch
              ? 'rgba(34,197,94,0.08)'
              : 'rgba(239,68,68,0.08)',
            color: faceMatch.isMatch ? theme.success : theme.error,
            fontSize: 14,
          }}
        >
          <strong style={{ fontWeight: 800 }}>
            {faceMatch.isMatch ? '✓ MATCH' : '✕ NO MATCH'}
          </strong>{' '}
          — similarity {faceMatch.similarity.toFixed(2)}%, confidence{' '}
          {faceMatch.confidence.toFixed(2)}% (threshold {faceMatch.threshold}%).
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {!selfie && (
          <button
            type="button"
            onClick={capture}
            disabled={busy}
            style={btnPrimary(busy)}
          >
            <Camera size={16} />
            Capture selfie
          </button>
        )}
        {selfie && !faceMatch?.isMatch && (
          <>
            <button
              type="button"
              onClick={() => {
                setSelfie(null);
                setFaceMatch(null);
                setErrorMessage(null);
                setStep('faceMatch', 'PENDING');
              }}
              disabled={busy}
              style={btnSecondary(busy)}
            >
              <RefreshCw size={16} />
              Retake
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              style={btnPrimary(busy)}
            >
              {busy ? (
                <Loader2 size={16} className="hcs-spin" />
              ) : (
                <Camera size={16} />
              )}
              {busy ? 'Matching…' : 'Run face match'}
            </button>
          </>
        )}
        {faceMatch?.isMatch && (
          <button
            type="button"
            onClick={() => navigate('/result')}
            style={btnPrimary(false)}
          >
            Continue
          </button>
        )}
      </div>
    </section>
  );
}

function Redirect({ to }: { to: string }) {
  const navigate = useNavigate();
  navigate(to, { replace: true });
  return null;
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
    cursor: disabled ? 'progress' : 'pointer',
    opacity: disabled ? 0.7 : 1,
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
    opacity: disabled ? 0.6 : 1,
  };
}
