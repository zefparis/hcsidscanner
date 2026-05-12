/**
 * Pure functions shared across all platforms.
 */

/**
 * Compute the aggregate KYC score in [0..1].
 *
 *   mrzPart  = 1.0 if (checkDigitsValid && !isExpired) else 0.5
 *   facePart = similarity / 100   (or 0 if face match was skipped)
 *
 *   score = mrzPart * 0.6 + facePart * 0.4
 */
export function computeKycScore(args: {
  mrzValid: boolean;
  documentExpired: boolean;
  faceSimilarity?: number;
}): number {
  const mrzPart = args.mrzValid && !args.documentExpired ? 1.0 : 0.5;
  const facePart =
    typeof args.faceSimilarity === 'number'
      ? Math.max(0, Math.min(100, args.faceSimilarity)) / 100
      : 0;
  return Math.round((mrzPart * 0.6 + facePart * 0.4) * 100) / 100;
}
