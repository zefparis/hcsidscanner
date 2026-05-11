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
} from '@hcs/id-scanner-core';

interface IDVerificationState {
  currentStep: Step;
  steps: StepperState;

  documentData: DocumentData | null;
  /** Front-side document photo, kept for the face-match call. */
  documentImageBase64: string | null;
  selfieBase64: string | null;
  faceMatchResult: FaceMatchResult | null;
  kycScore: number | null;

  /** HCS-U7 base URL — propagated from IDScannerConfig. */
  hcsApiUrl: string;
  /** Tenant ID — propagated from IDScannerConfig. */
  tenantId: string;
  /** API token sent as x-api-key header. */
  apiToken: string;

  errorMessage: string | null;

  // ── actions ──────────────────────────────────────────────────────────
  setStep: (id: keyof StepperState, status: StepStatus) => void;
  setCurrentStep: (step: Step) => void;
  setDocumentData: (data: DocumentData | null) => void;
  setDocumentImage: (img: string | null) => void;
  setSelfie: (img: string | null) => void;
  setFaceMatchResult: (r: FaceMatchResult | null) => void;
  setKycScore: (score: number | null) => void;
  setConfig: (cfg: { hcsApiUrl?: string; tenantId?: string; apiToken?: string }) => void;
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
  hcsApiUrl: '',
  tenantId: '',
  apiToken: '',
  errorMessage: null,

  setStep: (id, status) =>
    set((s) => ({ steps: { ...s.steps, [id]: status } })),
  setCurrentStep: (currentStep) => set({ currentStep }),
  setDocumentData: (documentData) => set({ documentData }),
  setDocumentImage: (documentImageBase64) => set({ documentImageBase64 }),
  setSelfie: (selfieBase64) => set({ selfieBase64 }),
  setFaceMatchResult: (faceMatchResult) => set({ faceMatchResult }),
  setKycScore: (kycScore) => set({ kycScore }),
  setConfig: (cfg) =>
    set((s) => ({
      hcsApiUrl: cfg.hcsApiUrl ?? s.hcsApiUrl,
      tenantId: cfg.tenantId ?? s.tenantId,
      apiToken: cfg.apiToken ?? s.apiToken,
    })),
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
      // hcsApiUrl, tenantId, apiToken intentionally kept across reset
      errorMessage: null,
    }),
}));

/**
 * Error thrown by `apiPost` when the server responds with an error payload.
 * Carries both the machine-readable code and optional human-readable message.
 */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly serverMessage?: string,
  ) {
    super(code);
  }
}

/**
 * POSTs JSON to a relative URL and parses the response, throwing an `ApiError`
 * (or plain Error for 'network_error' / 'parse_error') on failure.
 */
export async function apiPost<T>(
  url: string,
  body: unknown,
  signal?: AbortSignal,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...extraHeaders },
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
    const payload = data as { error?: string; message?: string };
    const code = payload?.error ?? `http_${res.status}`;
    throw new ApiError(code, payload?.message ?? undefined);
  }
  return data as T;
}
