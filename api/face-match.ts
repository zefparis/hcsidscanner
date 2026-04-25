/**
 * POST /api/face-match
 *
 * AWS Rekognition CompareFaces — selfie (live) vs Signicat chip portrait.
 *
 * Body: { sourceImageBase64: string, targetImageBase64: string }
 * 200:  { similarity: number, confidence: number, isMatch: boolean, threshold: number }
 *
 * The portrait/selfie payloads are NEVER logged — only the numeric verdict is.
 */

import {
  CompareFacesCommand,
  RekognitionClient,
} from '@aws-sdk/client-rekognition';

import {
  HttpError,
  readJson,
  sendJson,
  withErrorBoundary,
  type ApiHandler,
} from './_helpers';

interface FaceMatchBody {
  sourceImageBase64?: string;
  targetImageBase64?: string;
}

const MATCH_THRESHOLD = 90;

function decodeBase64(input: string): Uint8Array {
  const stripped = input.includes(',') ? input.split(',', 2)[1] : input;
  return Uint8Array.from(Buffer.from(stripped, 'base64'));
}

const handler: ApiHandler = async (req, res) => {
  if (req.method !== 'POST') {
    throw new HttpError(405, 'method_not_allowed');
  }

  const { sourceImageBase64, targetImageBase64 } =
    await readJson<FaceMatchBody>(req);

  if (!sourceImageBase64 || !targetImageBase64) {
    throw new HttpError(400, 'invalid_request');
  }

  const region = process.env.AWS_REGION ?? 'eu-west-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new HttpError(500, 'server_misconfigured');
  }

  const client = new RekognitionClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  const result = await client.send(
    new CompareFacesCommand({
      SourceImage: { Bytes: decodeBase64(sourceImageBase64) },
      TargetImage: { Bytes: decodeBase64(targetImageBase64) },
      SimilarityThreshold: 0,
      QualityFilter: 'AUTO',
    }),
  );

  const best = (result.FaceMatches ?? [])
    .map((m) => ({
      similarity: m.Similarity ?? 0,
      confidence: m.Face?.Confidence ?? 0,
    }))
    .sort((a, b) => b.similarity - a.similarity)[0];

  const similarity = best?.similarity ?? 0;
  const confidence = best?.confidence ?? 0;

  // Console marker (numeric only — no biometric data).
  // eslint-disable-next-line no-console
  console.log(
    `[face-match] similarity=${similarity.toFixed(2)} threshold=${MATCH_THRESHOLD}`,
  );

  sendJson(res, 200, {
    similarity,
    confidence,
    isMatch: similarity >= MATCH_THRESHOLD,
    threshold: MATCH_THRESHOLD,
  });
};

export default withErrorBoundary(handler);
