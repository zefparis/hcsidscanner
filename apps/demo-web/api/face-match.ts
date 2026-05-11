/**
 * POST /api/face-match
 *
 * Thin Vercel-style wrapper around `compareFaces` from
 * `@hcs/id-scanner-core`.
 *
 * Body : { sourceImageBase64, targetImageBase64, threshold? }
 * 200  : FaceMatchResult
 * 4xx  : { error: 'invalid_input' | 'no_face_detected' | 'rekognition_error' }
 *
 * Image bytes are not logged. Only similarity/threshold are.
 */

import { compareFaces, FaceMatchError } from '@hcs/id-scanner-core';

import {
  HttpError,
  readJson,
  sendJson,
  withSecurity,
  type ApiHandler,
} from './_helpers.js';

interface FaceMatchBody {
  sourceImageBase64?: string;
  targetImageBase64?: string;
  threshold?: number;
}

const handler: ApiHandler = async (req, res) => {
  if (req.method !== 'POST') {
    throw new HttpError(405, 'method_not_allowed');
  }

  const { sourceImageBase64, targetImageBase64, threshold } =
    await readJson<FaceMatchBody>(req);

  if (!sourceImageBase64 || !targetImageBase64) {
    throw new HttpError(400, 'invalid_input');
  }

  try {
    const result = await compareFaces(sourceImageBase64, targetImageBase64, {
      threshold,
    });
    // eslint-disable-next-line no-console
    console.log(
      `[face-match] similarity=${result.similarity.toFixed(2)} threshold=${result.threshold}`,
    );
    sendJson(res, 200, result);
  } catch (err) {
    if (err instanceof FaceMatchError) {
      const status =
        err.code === 'engine_unavailable'
          ? 500
          : err.code === 'invalid_input'
            ? 400
            : err.code === 'no_face_detected'
              ? 422
              : 502;
      throw new HttpError(status, err.code);
    }
    throw err;
  }
};

export default withSecurity(handler);
