/**
 * Face matching — pure function over AWS Rekognition `CompareFaces`.
 *
 * Used by the demo Vercel function and by anyone wanting to plug the
 * verification pipeline directly into their own backend.
 *
 * Image bytes are passed through to Rekognition only. They are *not*
 * persisted nor logged anywhere by this module.
 */

import {
  CompareFacesCommand,
  RekognitionClient,
  type CompareFacesCommandOutput,
} from '@aws-sdk/client-rekognition';

import type { FaceMatchResult } from './types';

export interface CompareFacesOptions {
  /** Minimum similarity to consider a positive match. Default 80. */
  threshold?: number;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export class FaceMatchError extends Error {
  constructor(
    public readonly code:
      | 'invalid_input'
      | 'no_face_detected'
      | 'rekognition_error'
      | 'engine_unavailable',
  ) {
    super(code);
  }
}

function decodeBase64(input: string): Uint8Array {
  const stripped = input.includes(',') ? input.split(',', 2)[1] : input;
  return Uint8Array.from(Buffer.from(stripped, 'base64'));
}

/**
 * Compare a source image (typically a live selfie) against a target
 * image (typically the document recto / chip portrait).
 */
export async function compareFaces(
  sourceImageBase64: string,
  targetImageBase64: string,
  options: CompareFacesOptions = {},
): Promise<FaceMatchResult> {
  if (!sourceImageBase64 || !targetImageBase64) {
    throw new FaceMatchError('invalid_input');
  }

  const threshold = options.threshold ?? 80;

  const region =
    options.region ?? process.env.AWS_REGION ?? 'eu-west-1';
  const accessKeyId =
    options.accessKeyId ?? process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    options.secretAccessKey ?? process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new FaceMatchError('engine_unavailable');
  }

  const client = new RekognitionClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  let result: CompareFacesCommandOutput;
  try {
    result = await client.send(
      new CompareFacesCommand({
        SourceImage: { Bytes: decodeBase64(sourceImageBase64) },
        TargetImage: { Bytes: decodeBase64(targetImageBase64) },
        SimilarityThreshold: 0,
        QualityFilter: 'AUTO',
      }),
    );
  } catch {
    throw new FaceMatchError('rekognition_error');
  }

  const matches = result.FaceMatches ?? [];
  if (matches.length === 0) {
    throw new FaceMatchError('no_face_detected');
  }

  const best = matches
    .map((m) => ({
      similarity: m.Similarity ?? 0,
      confidence: m.Face?.Confidence ?? 0,
    }))
    .sort((a, b) => b.similarity - a.similarity)[0]!;

  return {
    similarity: best.similarity,
    confidence: best.confidence,
    isMatch: best.similarity >= threshold,
    threshold,
  };
}

