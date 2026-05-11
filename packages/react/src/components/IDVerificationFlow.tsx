/**
 * IDVerificationFlow — single drop-in component that wraps the 3-step
 * KYC pipeline (document scan → selfie → verdict).
 *
 * No router required. The component drives its own internal state via
 * the `useIDVerification` zustand store. Consumers pass a `config` and
 * receive the final verdict via `onComplete`.
 *
 * ```tsx
 * import { IDVerificationFlow } from '@hcs/id-scanner-react';
 *
 * <IDVerificationFlow
 *   config={{ tenantId: 'acme', minFaceMatchScore: 80 }}
 *   onComplete={(result) => router.push(`/onboard?kyc=${result.kycScore}`)}
 *   onError={(code) => toast.error(code)}
 * />
 * ```
 */

import { useEffect, useMemo } from 'react';
import type {
  IDScannerConfig,
  IDVerificationResult,
} from '@hcs/id-scanner-core';
import { computeKycScore } from '@hcs/id-scanner-core';

import { DocumentScanner } from './DocumentScanner';
import { FaceMatch } from './FaceMatch';
import { IDVerificationResult as IDVerdict } from './IDVerificationResult';
import { Stepper } from './Stepper';
import { theme } from '../lib/theme';
import { useIDVerification } from '../hooks/useIDVerification';

export interface IDVerificationFlowProps {
  config: IDScannerConfig;
  /** Called once the user finishes step 3 with a non-failed verdict. */
  onComplete?: (result: IDVerificationResult) => void;
  /** Called when any step fails terminally. */
  onError?: (code: string) => void;
  /** Optional theme switch (currently `dark` is the only supported value). */
  theme?: 'dark' | 'light';
  /** Whether to render the top stepper. Default true. */
  showStepper?: boolean;
}

/**
 * Internal HashRouter-free orchestrator. Reads `currentStep` from the
 * zustand store and renders one of the three sub-components.
 */
export function IDVerificationFlow({
  config,
  onComplete,
  onError,
}: IDVerificationFlowProps) {
  const {
    currentStep,
    steps,
    documentData,
    faceMatchResult,
    errorMessage,
    kycScore,
    setConfig,
  } = useIDVerification();

  // Sync config values into the store so child components can read them.
  useEffect(() => {
    setConfig({
      hcsApiUrl: config.hcsApiUrl,
      tenantId: config.tenantId,
      apiToken: config.apiToken,
    });
  }, [config.hcsApiUrl, config.tenantId, config.apiToken, setConfig]);

  // Surface terminal errors to the parent.
  useEffect(() => {
    if (errorMessage) onError?.(errorMessage);
  }, [errorMessage, onError]);

  // Surface the final verdict the moment the result step succeeds.
  useEffect(() => {
    if (steps.result !== 'SUCCESS' || !documentData) return;
    const score =
      kycScore ??
      computeKycScore({
        mrzValid: documentData.checkDigitsValid,
        documentExpired: documentData.isExpired,
        faceSimilarity: faceMatchResult?.similarity,
      });
    const result: IDVerificationResult = {
      documentData,
      faceMatch: faceMatchResult ?? undefined,
      kycScore: score,
      timestamp: new Date().toISOString(),
      tenantId: config.tenantId,
      employeeId: config.employeeId,
    };
    onComplete?.(result);
  }, [
    steps.result,
    documentData,
    faceMatchResult,
    kycScore,
    config.tenantId,
    config.employeeId,
    onComplete,
  ]);

  const skipFaceMatch = config.requireFaceMatch === false;

  const screen = useMemo(() => {
    // The internal state machine: DOCUMENT → FACE_MATCH → RESULT.
    if (currentStep === 'DOCUMENT') return <DocumentScanner />;
    if (currentStep === 'FACE_MATCH' && !skipFaceMatch) return <FaceMatch />;
    return <IDVerdict />;
  }, [currentStep, skipFaceMatch]);

  return (
    <div
      style={{
        display: 'grid',
        gap: 24,
        color: theme.text,
        fontFamily: theme.font,
      }}
    >
      <Stepper steps={steps} />
      {screen}
    </div>
  );
}
