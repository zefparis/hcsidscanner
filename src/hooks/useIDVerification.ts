/**
 * useIDVerification — single source of truth for the 4-step KYC flow.
 *
 * Holds:
 *   - Stepper state machine
 *   - Signicat claims (after token exchange)
 *   - Face-match result
 *   - Final HCS-U7 registration verdict
 *
 * The verification context survives a full-page redirect through
 * sessionStorage so the post-OIDC callback can pick up where Étape 1 left off.
 */

import { create } from 'zustand';

import type {
  FaceMatchResult,
  SignicatClaims,
  StepStatus,
  StepperState,
} from '../types';

interface IDVerificationState {
  steps: StepperState;
  claims: SignicatClaims | null;
  faceMatch: FaceMatchResult | null;
  errorMessage: string | null;

  setStep: (id: keyof StepperState, status: StepStatus) => void;
  setClaims: (claims: SignicatClaims | null) => void;
  setFaceMatch: (result: FaceMatchResult | null) => void;
  setError: (msg: string | null) => void;
  reset: () => void;
}

const initialSteps: StepperState = {
  start: 'PENDING',
  callback: 'PENDING',
  faceMatch: 'PENDING',
  result: 'PENDING',
};

export const useIDVerification = create<IDVerificationState>((set) => ({
  steps: initialSteps,
  claims: null,
  faceMatch: null,
  errorMessage: null,

  setStep: (id, status) =>
    set((s) => ({ steps: { ...s.steps, [id]: status } })),
  setClaims: (claims) => set({ claims }),
  setFaceMatch: (result) => set({ faceMatch: result }),
  setError: (msg) => set({ errorMessage: msg }),
  reset: () =>
    set({
      steps: initialSteps,
      claims: null,
      faceMatch: null,
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
    const code =
      (data as { error?: string })?.error ?? `http_${res.status}`;
    throw new Error(code);
  }
  return data as T;
}
