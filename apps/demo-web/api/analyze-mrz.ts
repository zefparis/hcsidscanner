/**
 * POST /api/analyze-mrz
 *
 * Thin Vercel-style wrapper around `analyzeMRZ` from
 * `@hcs/id-scanner-core`. Anyone wanting their own backend can copy
 * this file verbatim or import the function directly.
 *
 * Body : { imageBase64: string }  (also accepts `image`, `base64`, `documentImageBase64`)
 * 200  : DocumentData
 * 4xx  : { error, message }
 */

import {
  readJson,
  sendJson,
  withSecurity,
  type ApiHandler,
} from './_helpers.js';

// ── Robust payload extraction ────────────────────────────────────────────

/**
 * Tolerates multiple field names and data-URL vs raw base64 formats.
 * Returns the cleaned base64 string (no `data:` prefix) or null.
 */
function getBase64FromBody(body: Record<string, unknown>): string | null {
  const value =
    body?.imageBase64 ??
    body?.image ??
    body?.base64 ??
    body?.documentImageBase64;

  if (typeof value !== 'string' || value.length < 100) {
    return null;
  }

  // Strip data-URL prefix if present (e.g. "data:image/jpeg;base64,...")
  return value.includes(',') ? value.split(',')[1] : value;
}

// ── Error detail messages ────────────────────────────────────────────────

const ERROR_DETAIL: Record<string, string> = {
  invalid_input: 'Expected imageBase64 as a non-empty base64-encoded string (JPEG/PNG).',
  no_mrz_found:
    'No readable MRZ zone detected in the image. Ensure the full document bottom is visible with good lighting.',
  parse_failed:
    'MRZ zone detected but could not be parsed. Avoid glare, tilt, and partial captures.',
  engine_unavailable:
    'MRZ processing engine failed to load. Contact support.',
};

function mrzErrorCode(err: unknown): string | null {
  if (err instanceof Error && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

// ── Handler ──────────────────────────────────────────────────────────────

const handler: ApiHandler = async (req, res) => {
  if (req.method !== 'POST') {
    sendJson(res, 405, {
      error: 'method_not_allowed',
      message: 'Only POST is accepted.',
    });
    return;
  }

  const body = await readJson<Record<string, unknown>>(req);

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log('[analyze-mrz] body keys:', Object.keys(body));
    // eslint-disable-next-line no-console
    console.log('[analyze-mrz] content-type:', req.headers['content-type']);
  }

  const imageBase64 = getBase64FromBody(body);

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log('[analyze-mrz] image length:', imageBase64?.length ?? 0);
  }

  if (!imageBase64) {
    sendJson(res, 422, {
      error: 'INVALID_IMAGE_PAYLOAD',
      message: ERROR_DETAIL.invalid_input,
      receivedKeys: Object.keys(body),
    });
    return;
  }

  try {
    // eslint-disable-next-line no-console
    console.log('[analyze-mrz] before core import');
    const core = await import('@hcs/id-scanner-core');
    // eslint-disable-next-line no-console
    console.log('[analyze-mrz] after core import');
    // eslint-disable-next-line no-console
    console.log('[analyze-mrz] before analyzeMRZ');
    const documentData = await core.analyzeMRZ(imageBase64);
    sendJson(res, 200, documentData);
  } catch (err) {
    const code = mrzErrorCode(err);
    if (code) {
      const status =
        code === 'engine_unavailable'
          ? 500
          : code === 'invalid_input'
            ? 400
            : 422;
      sendJson(res, status, {
        error: code === 'no_mrz_found' ? 'MRZ_NOT_DETECTED' : code,
        message: ERROR_DETAIL[code] ?? 'Unknown MRZ error.',
      });
      return;
    }
    // eslint-disable-next-line no-console
    console.error('[analyze-mrz]', {
      error: err instanceof Error ? err.message : String(err),
    });
    sendJson(res, 500, {
      error: 'engine_unavailable',
      message: 'MRZ processing engine failed on server',
    });
  }
};

export default withSecurity(handler);
