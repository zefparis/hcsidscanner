/**
 * useIDVerification — single source of truth for the 3-step KYC flow.
 *
 * Flow:
 *   1. DOCUMENT     — react-webcam capture + /api/analyze-mrz
 *   2. FACE_MATCH   — selfie + /api/face-match (Rekognition CompareFaces)
 *   3. RESULT       — composite KYC score + register in HCS-U7
 */

import { create } from 'zustand';

import type {
  DocumentData,
  FaceMatchResult,
  Step,
  StepStatus,
  StepperState,
} from '../types';

interface IDVerificationState {
  currentStep: Step;
  steps: StepperState;

  documentData: DocumentData | null;
  /** Front-side document photo, kept for the face-match call. */
  documentImageBase64: string | null;
  selfieBase64: string | null;
  faceMatchResult: FaceMatchResult | null;
  kycScore: number | null;

  errorMessage: string | null;

  // ── actions ──────────────────────────────────────────────────────────
  setStep: (id: keyof StepperState, status: StepStatus) => void;
  setCurrentStep: (step: Step) => void;
  setDocumentData: (data: DocumentData | null) => void;
  setDocumentImage: (img: string | null) => void;
  setSelfie: (img: string | null) => void;
  setFaceMatchResult: (r: FaceMatchResult | null) => void;
  setKycScore: (score: number | null) => void;
  setError: (msg: string | null) => void;
  reset: () => void;
}

const initialSteps: StepperState = {
  document: 'PENDING',
  faceMatch: 'PENDING',
  result: 'PENDING',
};

export const useIDVerification = create<IDVerificationState>((set) => ({
  currentStep: 'DOCUMENT',
  steps: initialSteps,
  documentData: null,
  documentImageBase64: null,
  selfieBase64: null,
  faceMatchResult: null,
  kycScore: null,
  errorMessage: null,

  setStep: (id, status) =>
    set((s) => ({ steps: { ...s.steps, [id]: status } })),
  setCurrentStep: (currentStep) => set({ currentStep }),
  setDocumentData: (documentData) => set({ documentData }),
  setDocumentImage: (documentImageBase64) => set({ documentImageBase64 }),
  setSelfie: (selfieBase64) => set({ selfieBase64 }),
  setFaceMatchResult: (faceMatchResult) => set({ faceMatchResult }),
  setKycScore: (kycScore) => set({ kycScore }),
  setError: (errorMessage) => set({ errorMessage }),
  reset: () =>
    set({
      currentStep: 'DOCUMENT',
      steps: initialSteps,
      documentData: null,
      documentImageBase64: null,
      selfieBase64: null,
      faceMatchResult: null,
      kycScore: null,
      errorMessage: null,
    }),
}));

/**
 * POSTs JSON to a relative URL and parses the response, throwing the API's
 * `error` code (or 'network_error' / 'parse_error') on failure.
 */
export async function apiPost<T>(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new Error('network_error');
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    throw new Error('parse_error');
  }
  if (!res.ok) {
    const code = (data as { error?: string })?.error ?? `http_${res.status}`;
    throw new Error(code);
  }
  return data as T;
}
