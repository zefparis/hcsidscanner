/**
 * useIDVerificationNative — same shape as the web hook but for React Native.
 *
 * The store deliberately mirrors `@hcs/id-scanner-react`'s `useIDVerification`
 * so a shared backend can drive both code paths without forking the type
 * surface.
 */

import { create } from 'zustand';

import type {
  DocumentData,
  FaceMatchResult,
  Step,
  StepStatus,
  StepperState,
} from '@hcs/id-scanner-core';
import type { PassportNfcResult } from '../nfc';

interface IDVerificationNativeState {
  currentStep: Step;
  steps: StepperState;

  documentData: DocumentData | null;
  /** URI to the captured document image (file:// or content://). */
  documentImageUri: string | null;
  /** URI to the captured selfie. */
  selfieUri: string | null;
  faceMatchResult: FaceMatchResult | null;
  kycScore: number | null;

  /** When NFC is supported and the chip was successfully read. */
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

const initialSteps: StepperState = {
  document: 'PENDING',
  nfcPassport: 'PENDING',
  faceMatch: 'PENDING',
  result: 'PENDING',
};

export const useIDVerificationNative = create<IDVerificationNativeState>(
  (set) => ({
    currentStep: 'DOCUMENT',
    steps: initialSteps,
    documentData: null,
    documentImageUri: null,
    selfieUri: null,
    faceMatchResult: null,
    kycScore: null,
    nfcChipAuthentic: null,
    passportNfcResult: null,
    errorMessage: null,

    setStep: (id, status) =>
      set((s) => ({ steps: { ...s.steps, [id]: status } })),
    setCurrentStep: (currentStep) => set({ currentStep }),
    setDocumentData: (documentData) => set({ documentData }),
    setDocumentImageUri: (documentImageUri) => set({ documentImageUri }),
    setSelfieUri: (selfieUri) => set({ selfieUri }),
    setFaceMatchResult: (faceMatchResult) => set({ faceMatchResult }),
    setKycScore: (kycScore) => set({ kycScore }),
    setNfcChipAuthentic: (nfcChipAuthentic) => set({ nfcChipAuthentic }),
    setPassportNfcResult: (passportNfcResult) => set({ passportNfcResult }),
    setError: (errorMessage) => set({ errorMessage }),
    reset: () =>
      set({
        currentStep: 'DOCUMENT',
        steps: initialSteps,
        documentData: null,
        documentImageUri: null,
        selfieUri: null,
        faceMatchResult: null,
        kycScore: null,
        nfcChipAuthentic: null,
        passportNfcResult: null,
        errorMessage: null,
      }),
  }),
);
