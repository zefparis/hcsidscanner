/**
 * `@hcs/id-scanner-native` — React Native components for the HCS
 * ID Scanner KYC pipeline. Targets Android + iOS via VisionCamera.
 *
 * The MRZ analysis (`mrz-detection`) and face match (Rekognition) calls
 * cannot run in the JS bundle — they are proxied through a backend that
 * imports `@hcs/id-scanner-core`. See the demo Vercel functions for a
 * reference implementation.
 */

export {
  IDVerificationFlowNative,
  type IDVerificationFlowNativeProps,
} from './components/IDVerificationFlowNative';

export { DocumentScannerNative } from './components/DocumentScannerNative';
export { FaceMatchNative } from './components/FaceMatchNative';
export { NFCReaderNative } from './components/NFCReaderNative';

export { useIDVerificationNative } from './hooks/useIDVerificationNative';

// Re-export public core types for convenience.
export type {
  DocumentData,
  FaceMatchResult,
  IDScannerConfig,
  IDVerificationResult,
  Step,
  StepStatus,
  StepperState,
} from '@hcs/id-scanner-core';
