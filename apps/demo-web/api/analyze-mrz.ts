/**
 * POST /api/analyze-mrz
 *
 * Thin Vercel-style wrapper around `analyzeMRZ` from
 * `@hcs/id-scanner-core`. Anyone wanting their own backend can copy
 * this file verbatim or import the function directly.
 *
 * Body : { imageBase64: string }
 * 200  : DocumentData
 * 4xx  : { error: 'invalid_input' | 'no_mrz_found' | 'parse_failed' }
 */

import { analyzeMRZ, MRZError } from '@hcs/id-scanner-core';

import {
  HttpError,
  readJson,
  sendJson,
  withSecurity,
  type ApiHandler,
} from './_helpers.js';

interface AnalyzeBody {
  imageBase64?: string;
}

const handler: ApiHandler = async (req, res) => {
  if (req.method !== 'POST') {
    throw new HttpError(405, 'method_not_allowed');
  }

  const { imageBase64 } = await readJson<AnalyzeBody>(req);
  if (!imageBase64) throw new HttpError(400, 'invalid_input');

  try {
    const documentData = await analyzeMRZ(imageBase64);
    sendJson(res, 200, documentData);
  } catch (err) {
    if (err instanceof MRZError) {
      const status =
        err.code === 'engine_unavailable'
          ? 500
          : err.code === 'invalid_input'
            ? 400
            : 422;
      throw new HttpError(status, err.code);
    }
    throw err;
  }
};

export default withSecurity(handler);
