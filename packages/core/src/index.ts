/**
 * Public API — re-exported by both `@hcs/id-scanner-react` and
 * `@hcs/id-scanner-native` consumers, and used directly by anyone
 * embedding the lib in their own backend.
 */

export type {
  DocumentData,
  FaceMatchResult,
  IDScannerConfig,
  IDVerificationResult,
  Step,
  StepStatus,
  StepperState,
} from './types.js';

export { analyzeMRZ, MRZError } from './mrz.js';
export {
  compareFaces,
  computeKycScore,
  FaceMatchError,
  type CompareFacesOptions,
} from './rekognition.js';
