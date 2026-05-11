/**
 * Cross-package types — shared by `@hcs/id-scanner-core`,
 * `@hcs/id-scanner-react` and `@hcs/id-scanner-native`.
 */

// ─────────────────────────────────────────────────────────────────────────
// Document data
// ─────────────────────────────────────────────────────────────────────────

/** Structured data extracted from a document's MRZ band (post-validation). */
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

// ─────────────────────────────────────────────────────────────────────────
// Face match (AWS Rekognition CompareFaces wrapper)
// ─────────────────────────────────────────────────────────────────────────

export interface FaceMatchResult {
  /** [0..100] — best similarity score returned by Rekognition. */
  similarity: number;
  /** [0..100] — confidence of the underlying face detection. */
  confidence: number;
  /** True iff `similarity >= threshold`. */
  isMatch: boolean;
  /** Threshold used for the match decision (default 80). */
  threshold: number;
}

// ─────────────────────────────────────────────────────────────────────────
// End-to-end flow
// ─────────────────────────────────────────────────────────────────────────

/**
 * Final aggregated KYC verdict — what `IDVerificationFlow.onComplete`
 * receives and what gets posted to HCS-U7.
 */
export interface IDVerificationResult {
  documentData: DocumentData;
  faceMatch?: FaceMatchResult;
  /** Composite KYC score in [0..1]. See `computeKycScore`. */
  kycScore: number;
  /** RFC3339 UTC timestamp at the moment the flow completed. */
  timestamp: string;
  tenantId: string;
  employeeId?: string;
}

/**
 * Configuration consumed by both the React and React Native flows.
 * AWS credentials are *only* needed when the lib calls Rekognition
 * itself; in the typical SaaS deployment the calls are proxied through
 * a backend that holds them, and these fields are left empty.
 */
export interface IDScannerConfig {
  /** AWS region for Rekognition (default `eu-west-1`). */
  awsRegion?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  /** Min Rekognition similarity to consider a positive match. Default 80. */
  minFaceMatchScore?: number;
  /** When false, `IDVerificationFlow` skips the selfie step. Default true. */
  requireFaceMatch?: boolean;
  /** HCS-U7 KYC ingestion endpoint base URL. */
  hcsApiUrl?: string;
  /** Tenant identifier — required to scope the verdict in HCS-U7. */
  tenantId: string;
  /** Optional pre-existing employee id — emitted in the registration payload. */
  employeeId?: string;
  /** Optional API token sent as `x-api-key` header to the backend endpoints. */
  apiToken?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// State machine (used by the React/Native packages, exported from core
// so consumers can derive their own UIs without re-declaring the union).
// ─────────────────────────────────────────────────────────────────────────

export type StepStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';

export type Step = 'DOCUMENT' | 'FACE_MATCH' | 'RESULT';

export interface StepperState {
  document: StepStatus;
  faceMatch: StepStatus;
  result: StepStatus;
}
