/**
 * Ambient type declarations for @hcs/id-scanner-native.
 *
 * We type-declare the package here instead of following tsconfig paths
 * into the source, because the native package carries @types/react@19
 * in its own devDeps which conflicts with our @types/react@18.2.
 *
 * Only the symbols actually used by apps/mobile screens are declared.
 * Keep in sync with packages/native/src/index.ts if exports change.
 */

// ─── Re-exported core types ──────────────────────────────────────────────────

export interface DocumentData {
  firstName: string;
  lastName: string;
  nationality: string;
  dateOfBirth: string;
  documentNumber: string;
  expirationDate: string;
  documentType: string;
  issuingCountry: string;
  sex: string;
  isExpired: boolean;
  checkDigitsValid: boolean;
  rawMRZ: string[];
}

export interface FaceMatchResult {
  similarity: number;
  confidence: number;
  isMatch: boolean;
  threshold: number;
}

export type StepStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';
export type Step = 'DOCUMENT' | 'NFC_PASSPORT' | 'FACE_MATCH' | 'RESULT';

export interface StepperState {
  document: StepStatus;
  nfcPassport?: StepStatus;
  faceMatch: StepStatus;
  result: StepStatus;
}

// ─── NFC types ───────────────────────────────────────────────────────────────

export interface PassportNfcResult {
  success: boolean;
  chipMrzMatchesScannedMrz: boolean;
  passiveAuthenticationPassed?: boolean;
  warnings: string[];
  dg1?: unknown;
  dg2FaceImageBase64?: string;
  sod?: unknown;
  com?: unknown;
}

// ─── Zustand store ───────────────────────────────────────────────────────────

export interface IDVerificationNativeState {
  currentStep: Step;
  steps: StepperState;
  documentData: DocumentData | null;
  documentImageUri: string | null;
  selfieUri: string | null;
  faceMatchResult: FaceMatchResult | null;
  kycScore: number | null;
  nfcChipAuthentic: boolean | null;
  passportNfcResult: PassportNfcResult | null;
  errorMessage: string | null;

  setStep: (id: keyof StepperState, status: StepStatus) => void;
  setCurrentStep: (step: Step) => void;
  setDocumentData: (data: DocumentData | null) => void;
  setDocumentImageUri: (uri: string | null) => void;
  setSelfieUri: (uri: string | null) => void;
  setFaceMatchResult: (r: FaceMatchResult | null) => void;
  setKycScore: (score: number | null) => void;
  setNfcChipAuthentic: (ok: boolean | null) => void;
  setPassportNfcResult: (result: PassportNfcResult | null) => void;
  setError: (msg: string | null) => void;
  reset: () => void;
}

export declare const useIDVerificationNative: {
  (): IDVerificationNativeState;
  <T>(selector: (state: IDVerificationNativeState) => T): T;
};

// ─── Components ──────────────────────────────────────────────────────────────

import type { ReactElement } from 'react';

export interface DocumentScannerNativeProps {
  analyzeMrzEndpoint: string;
  authHeader?: string;
}
export declare function DocumentScannerNative(
  props: DocumentScannerNativeProps,
): ReactElement;

export interface PassportNfcReaderProps {
  optional?: boolean;
  onComplete?: (result: PassportNfcResult) => void;
  onSkip?: () => void;
}
export declare function PassportNfcReader(
  props: PassportNfcReaderProps,
): ReactElement;

export interface FaceMatchNativeProps {
  faceMatchEndpoint: string;
  authHeader?: string;
  threshold?: number;
}
export declare function FaceMatchNative(
  props: FaceMatchNativeProps,
): ReactElement;
