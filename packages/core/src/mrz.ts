/**
 * MRZ analysis — pure function consumed by both server (Vercel functions)
 * and any other Node-side caller.
 *
 * Pipeline:
 *   1. base64 → Buffer
 *   2. `image-js`        decodes the JPEG/PNG into a pixel matrix
 *   3. `mrz-detection.getMrz()`  segments + crops the MRZ band
 *   4. `mrz-detection.readMrz()` OCRs the cropped band (svm + ocrb)
 *   5. `mrz.parse()`     parses + validates every check digit
 *
 * The image bytes never leave the function and are never logged.
 *
 * `mrz-detection` and `image-js` are CommonJS modules — we use dynamic
 * `await import()` to stay compatible with both `bundler` and `nodenext`
 * module resolution settings.
 */

import type { DocumentData } from './types';

interface MrzParseResult {
  format: string;
  valid: boolean;
  fields: Record<string, string | null | undefined>;
  documentNumber: string | null;
}

export class MRZError extends Error {
  constructor(
    public readonly code:
      | 'invalid_input'
      | 'no_mrz_found'
      | 'parse_failed'
      | 'engine_unavailable',
  ) {
    super(code);
  }
}

function decodeBase64(input: string): Buffer {
  const stripped = input.includes(',') ? input.split(',', 2)[1] : input;
  return Buffer.from(stripped, 'base64');
}

/**
 * MRZ dates come back as `YYMMDD`. Convert to ISO `YYYY-MM-DD`.
 *
 * Century pivot follows the ICAO recommendation: 30-99 → 19xx, 00-29 → 20xx.
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

/**
 * Read + parse an MRZ from a base64-encoded image.
 *
 * @param imageBase64 — JPEG/PNG bytes, with or without `data:` prefix.
 * @throws {MRZError} on any failure (no PII leakage in error messages).
 */
export async function analyzeMRZ(imageBase64: string): Promise<DocumentData> {
  if (!imageBase64) throw new MRZError('invalid_input');

  const buffer = decodeBase64(imageBase64);
  if (buffer.byteLength === 0) throw new MRZError('invalid_input');

  // ── 1. Decode the image ─────────────────────────────────────────────
  const imageJs = (await import('image-js')) as unknown as {
    Image?: { load: (b: Buffer) => Promise<unknown> };
    default?: { Image?: { load: (b: Buffer) => Promise<unknown> } };
  };
  const Image = imageJs.Image ?? imageJs.default?.Image;
  if (!Image) throw new MRZError('engine_unavailable');

  let image: unknown;
  try {
    image = await Image.load(buffer);
  } catch {
    throw new MRZError('invalid_input');
  }

  // ── 2-3. Crop + OCR the MRZ band ────────────────────────────────────
  const detection = (await import('mrz-detection')) as unknown as {
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
  const getMrz = detection.getMrz ?? detection.default?.getMrz;
  const readMrz = detection.readMrz ?? detection.default?.readMrz;
  if (!getMrz || !readMrz) throw new MRZError('engine_unavailable');

  let cropped: unknown;
  try {
    cropped = getMrz(image);
  } catch {
    throw new MRZError('no_mrz_found');
  }

  let lines: string[];
  try {
    const result = await readMrz(cropped);
    lines = result.mrz.map((l) => String(l).trim()).filter(Boolean);
  } catch {
    throw new MRZError('no_mrz_found');
  }
  if (lines.length < 2) throw new MRZError('no_mrz_found');

  // ── 4. Parse + validate check digits ────────────────────────────────
  const mrzMod = (await import('mrz')) as unknown as {
    parse?: (lines: string[]) => MrzParseResult;
    default?: { parse?: (lines: string[]) => MrzParseResult };
  };
  const parse = mrzMod.parse ?? mrzMod.default?.parse;
  if (!parse) throw new MRZError('engine_unavailable');

  let parsed: MrzParseResult;
  try {
    parsed = parse(lines);
  } catch {
    throw new MRZError('parse_failed');
  }

  const f = parsed.fields ?? {};
  const expirationIso = mrzDateToIso(f.expirationDate ?? '');
  const birthIso = mrzDateToIso(f.birthDate ?? '');

  return {
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
}
