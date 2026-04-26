/**
 * POST /api/analyze-mrz
 *
 * 100% open-source MRZ extraction (no Signicat, no third-party API).
 *
 * Pipeline:
 *   1. base64 → Buffer
 *   2. `image-js` decodes the JPEG/PNG into a pixel matrix
 *   3. `mrz-detection.getMrz()`   — segment + crop the MRZ band
 *   4. `mrz-detection.readMrz()`  — OCR the cropped band (svm + ocrb)
 *   5. `mrz.parse()`              — parse + validate every check digit
 *
 * Body : { imageBase64: string }
 * 200  : DocumentData
 * 4xx  : { error: 'invalid_request' | 'no_mrz_found' | 'parse_failed' }
 *
 * The image bytes never leave the function and are never logged.
 */

import {
  HttpError,
  readJson,
  sendJson,
  withErrorBoundary,
  type ApiHandler,
} from './_helpers.js';

interface AnalyzeBody {
  imageBase64?: string;
}

interface MrzParseResult {
  format: string;
  valid: boolean;
  fields: Record<string, string | null | undefined>;
  documentNumber: string | null;
}

function decodeBase64(input: string): Buffer {
  const stripped = input.includes(',') ? input.split(',', 2)[1] : input;
  return Buffer.from(stripped, 'base64');
}

/**
 * MRZ dates come back as `YYMMDD`. Convert to ISO `YYYY-MM-DD`.
 *
 * The pivot for the century is 1930 (ICAO rec): 30-99 → 19xx, 00-29 → 20xx.
 */
function mrzDateToIso(yymmdd: string | null | undefined): string {
  if (!yymmdd || !/^\d{6}$/.test(yymmdd)) return '';
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const century = yy >= 30 ? 1900 : 2000;
  return `${century + yy}-${mm}-${dd}`;
}

function isExpired(isoDate: string): boolean {
  if (!isoDate) return false;
  const ts = Date.parse(isoDate);
  if (Number.isNaN(ts)) return false;
  return ts < Date.now();
}

const handler: ApiHandler = async (req, res) => {
  if (req.method !== 'POST') {
    throw new HttpError(405, 'method_not_allowed');
  }

  const { imageBase64 } = await readJson<AnalyzeBody>(req);
  if (!imageBase64) {
    throw new HttpError(400, 'invalid_request');
  }

  const buffer = decodeBase64(imageBase64);
  if (buffer.byteLength === 0) {
    throw new HttpError(400, 'invalid_request');
  }

  // ── 1. Decode the image ──────────────────────────────────────────────
  // `image-js` is a transitive dep of mrz-detection, so it's guaranteed
  // to be available without an extra direct dependency.
  const imageJs = (await import('image-js')) as unknown as {
    Image?: { load: (b: Buffer) => Promise<unknown> };
    default?: { Image?: { load: (b: Buffer) => Promise<unknown> } };
  };
  const Image = imageJs.Image ?? imageJs.default?.Image;
  if (!Image) {
    throw new HttpError(500, 'server_misconfigured');
  }

  let image: unknown;
  try {
    image = await Image.load(buffer);
  } catch {
    throw new HttpError(400, 'invalid_request');
  }

  // ── 2. Crop to the MRZ band ─────────────────────────────────────────
  // 3. OCR the band
  const mrzDetectionMod = (await import('mrz-detection')) as unknown as {
    getMrz?: (img: unknown) => unknown;
    readMrz?: (
      img: unknown,
    ) => Promise<{ mrz: string[]; rois: unknown[] }>;
    default?: {
      getMrz?: (img: unknown) => unknown;
      readMrz?: (
        img: unknown,
      ) => Promise<{ mrz: string[]; rois: unknown[] }>;
    };
  };
  const getMrz =
    mrzDetectionMod.getMrz ?? mrzDetectionMod.default?.getMrz;
  const readMrz =
    mrzDetectionMod.readMrz ?? mrzDetectionMod.default?.readMrz;
  if (!getMrz || !readMrz) {
    throw new HttpError(500, 'server_misconfigured');
  }

  let cropped: unknown;
  try {
    cropped = getMrz(image);
  } catch {
    throw new HttpError(400, 'no_mrz_found');
  }

  let lines: string[];
  try {
    const result = await readMrz(cropped);
    lines = result.mrz.map((l) => String(l).trim()).filter(Boolean);
  } catch {
    throw new HttpError(400, 'no_mrz_found');
  }
  if (lines.length < 2) {
    throw new HttpError(400, 'no_mrz_found');
  }

  // ── 4. Parse + validate check digits ─────────────────────────────────
  const mrzMod = (await import('mrz')) as unknown as {
    parse?: (lines: string[]) => MrzParseResult;
    default?: { parse?: (lines: string[]) => MrzParseResult };
  };
  const parse = mrzMod.parse ?? mrzMod.default?.parse;
  if (!parse) {
    throw new HttpError(500, 'server_misconfigured');
  }

  let parsed: MrzParseResult;
  try {
    parsed = parse(lines);
  } catch {
    throw new HttpError(400, 'parse_failed');
  }

  const f = parsed.fields ?? {};
  const expirationIso = mrzDateToIso(f.expirationDate ?? '');
  const birthIso = mrzDateToIso(f.birthDate ?? '');

  const documentData = {
    firstName: f.firstName ?? '',
    lastName: f.lastName ?? '',
    nationality: f.nationality ?? '',
    dateOfBirth: birthIso,
    documentNumber: parsed.documentNumber ?? f.documentNumber ?? '',
    expirationDate: expirationIso,
    documentType: f.documentCode ?? '',
    issuingCountry: f.issuingState ?? '',
    sex: f.sex ?? '',
    isExpired: isExpired(expirationIso),
    checkDigitsValid: Boolean(parsed.valid),
    rawMRZ: lines,
  };

  // Numeric/structural log only — no PII.
  // eslint-disable-next-line no-console
  console.log(
    `[analyze-mrz] format=${parsed.format} valid=${parsed.valid} lines=${lines.length}`,
  );

  sendJson(res, 200, documentData);
};

export default withErrorBoundary(handler);
