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
} from './types';

export { computeKycScore } from './utils';

export { analyzeMRZ, MRZError } from './mrz';
export {
  compareFaces,
  FaceMatchError,
  type CompareFacesOptions,
} from './rekognition';
