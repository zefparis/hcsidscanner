/**
 * Cross-cutting types for the HCS ID Scanner KYC flow.
 *
 * Three boundaries:
 *   - Signicat OIDC claims (Étape 2 output)
 *   - Face-match result   (Étape 3 output)
 *   - Stepper state machine
 */

export type StepStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';

export type StepId = 'start' | 'callback' | 'face-match' | 'result';

export interface StepperState {
  start: StepStatus;
  callback: StepStatus;
  faceMatch: StepStatus;
  result: StepStatus;
}

/**
 * Whitelisted OIDC claims returned by the server-side token-exchange.
 * The raw access_token is stripped before reaching the client.
 */
export interface SignicatClaims {
  sub: string;
  given_name?: string;
  family_name?: string;
  birthdate?: string;
  document_number?: string;
  document_type?: string;
  expiry_date?: string;
  nationality?: string;
  /** base64-encoded JPEG portrait extracted from the chip (DG2). */
  portrait?: string;
  /** RFC3339 timestamp from Signicat indicating verification completion. */
  verified_at?: string;
}

export interface FaceMatchResult {
  similarity: number;
  confidence: number;
  isMatch: boolean;
  threshold: number;
}

export interface KycRegistrationPayload {
  claims: Omit<SignicatClaims, 'portrait'>;
  faceMatchScore: number;
  documentType?: string;
  isAuthentic: boolean;
  timestamp: string;
  tenantId: string;
  portraitStorageKey?: string;
}
