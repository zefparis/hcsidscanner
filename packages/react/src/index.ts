/**
 * `@hcs/id-scanner-react` — React/PWA components for the HCS ID Scanner
 * KYC pipeline.
 *
 * Most consumers want the all-in-one `IDVerificationFlow`. The individual
 * step components and the underlying zustand store are also exported for
 * teams that need finer-grained composition.
 */

export {
  IDVerificationFlow,
  type IDVerificationFlowProps,
} from './components/IDVerificationFlow';

export { DocumentScanner } from './components/DocumentScanner';
export { FaceMatch } from './components/FaceMatch';
export { IDVerificationResult } from './components/IDVerificationResult';
export { Stepper } from './components/Stepper';

export {
  useIDVerification,
  apiPost,
  ApiError,
} from './hooks/useIDVerification';

export { theme, STATUS_COLOR } from './lib/theme';

// Re-export the public core types so consumers don't need to import
// `@hcs/id-scanner-core` separately.
export type {
  DocumentData,
  FaceMatchResult,
  IDScannerConfig,
  IDVerificationResult as IDVerificationResultData,
  Step,
  StepStatus,
  StepperState,
} from '@hcs/id-scanner-core';
