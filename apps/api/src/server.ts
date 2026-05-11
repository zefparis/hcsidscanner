import cors from 'cors';
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';

import { analyzeMRZ } from '@hcs/id-scanner-core';

const SERVICE_NAME = 'hcs-id-scanner-api';
const PORT = Number(process.env.PORT ?? 3000);
const API_SECRET = process.env.API_SECRET ?? '';
const CORS_ALLOWED_ORIGIN = process.env.CORS_ALLOWED_ORIGIN ?? '';

const ERROR_DETAIL: Record<string, string> = {
  invalid_input: 'Expected imageBase64 as a non-empty base64-encoded string (JPEG/PNG).',
  no_mrz_found:
    'No readable MRZ zone detected in the image. Ensure the full document bottom is visible with good lighting.',
  parse_failed:
    'MRZ zone detected but could not be parsed. Avoid glare, tilt, and partial captures.',
  engine_unavailable: 'MRZ processing engine failed to load. Contact support.',
};

function getBase64FromBody(body: Record<string, unknown>): string | null {
  const value =
    body?.imageBase64 ??
    body?.image ??
    body?.base64 ??
    body?.documentImageBase64;

  if (typeof value !== 'string' || value.length < 100) {
    return null;
  }

  return value.includes(',') ? value.split(',')[1] : value;
}

function mrzErrorCode(err: unknown): string | null {
  if (err instanceof Error && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

function sendError(
  res: Response,
  status: number,
  error: string,
  message?: string,
): void {
  res.status(status).json({ error, message: message ?? error });
}

const app = express();

app.disable('x-powered-by');

app.use(
  cors({
    origin(origin, callback) {
      if (!CORS_ALLOWED_ORIGIN || !origin || origin === CORS_ALLOWED_ORIGIN) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    allowedHeaders: ['content-type', 'x-api-key'],
    methods: ['GET', 'POST', 'OPTIONS'],
  }),
);

app.use(express.json({ limit: '4mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: SERVICE_NAME });
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (
    CORS_ALLOWED_ORIGIN &&
    typeof origin === 'string' &&
    origin !== CORS_ALLOWED_ORIGIN
  ) {
    sendError(res, 403, 'forbidden_origin', 'Origin is not allowed.');
    return;
  }
  next();
});

app.use((req, res, next) => {
  if (API_SECRET && req.headers['x-api-key'] !== API_SECRET) {
    sendError(res, 401, 'unauthorized', 'Missing or invalid API key.');
    return;
  }
  next();
});

app.post('/api/analyze-mrz', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const imageBase64 = getBase64FromBody(body);

  if (!imageBase64) {
    sendError(
      res,
      422,
      'INVALID_IMAGE_PAYLOAD',
      ERROR_DETAIL.invalid_input,
    );
    return;
  }

  try {
    const documentData = await analyzeMRZ(imageBase64);
    res.json(documentData);
  } catch (err) {
    const code = mrzErrorCode(err);

    if (code) {
      const status =
        code === 'engine_unavailable'
          ? 500
          : code === 'invalid_input'
            ? 400
            : 422;
      sendError(
        res,
        status,
        code === 'no_mrz_found' ? 'MRZ_NOT_DETECTED' : code,
        ERROR_DETAIL[code] ?? 'Unknown MRZ error.',
      );
      return;
    }

    console.error('[analyze-mrz]', {
      error: err instanceof Error ? err.message : String(err),
    });
    sendError(res, 500, 'internal_error', 'Unexpected API error');
  }
});

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err?.type === 'entity.too.large') {
    sendError(res, 413, 'payload_too_large', 'Request payload is too large.');
    return;
  }

  if (err instanceof SyntaxError) {
    sendError(res, 400, 'invalid_json', 'Invalid JSON payload.');
    return;
  }

  console.error('[api]', {
    error: err instanceof Error ? err.message : String(err),
  });
  sendError(res, 500, 'internal_error', 'Unexpected API error');
};

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`${SERVICE_NAME} listening on ${PORT}`);
});
