/**
 * Cross-cutting types for the HCS ID Scanner KYC flow.
 *
 * Three boundaries:
 *   - DocumentData       (Étape 1: MRZ extraction output)
 *   - FaceMatchResult    (Étape 2: Rekognition CompareFaces output)
 *   - Stepper state machine
 */

export type StepStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';

export type Step = 'DOCUMENT' | 'FACE_MATCH' | 'RESULT';

export interface StepperState {
  document: StepStatus;
  faceMatch: StepStatus;
  result: StepStatus;
}

/**
 * Structured data extracted from a document's MRZ band.
 * The MRZ is the cryptographic-backed source of truth on travel documents:
 * each field carries a check digit, validated by `mrz` on parse.
 */
export interface DocumentData {
  firstName: string;
  lastName: string;
  nationality: string;
  /** ISO 8601 — `YYYY-MM-DD` */
  dateOfBirth: string;
  documentNumber: string;
  /** ISO 8601 — `YYYY-MM-DD` */
  expirationDate: string;
  /** `P` (passport) | `I` (ID card) | `V` (visa) | etc. */
  documentType: string;
  issuingCountry: string;
  sex: string;
  isExpired: boolean;
  /** True iff every check digit in the MRZ matched. */
  checkDigitsValid: boolean;
  /** Raw MRZ lines — kept for debugging only, never persisted. */
  rawMRZ: string[];
}

export interface FaceMatchResult {
  similarity: number;
  confidence: number;
  isMatch: boolean;
  threshold: number;
}

export interface KycRegistrationPayload {
  documentData: Omit<DocumentData, 'rawMRZ'>;
  faceMatchScore: number;
  kycScore: number;
  timestamp: string;
  tenantId: string;
}
