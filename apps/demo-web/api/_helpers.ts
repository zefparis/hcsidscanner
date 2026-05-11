/**
 * Shared helpers for API handlers (Vercel-style request/response shape).
 *
 * The same handler files run in two contexts:
 *   1. Vite dev — wired through `vitePluginApi.ts`
 *   2. Vercel   — auto-deployed as serverless functions from /api
 *
 * We keep the surface deliberately small so it works under both.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export interface ApiRequest extends IncomingMessage {
  body?: unknown;
}

export type ApiResponse = ServerResponse;

export type ApiHandler = (
  req: ApiRequest,
  res: ApiResponse,
) => Promise<void> | void;

export async function readJson<T = unknown>(req: ApiRequest): Promise<T> {
  if (req.body !== undefined) {
    // Some runtimes (Vercel) populate req.body for us.
    return req.body as T;
  }
  const chunks: Buffer[] = [];
  for await (const c of req) {
    chunks.push(typeof c === 'string' ? Buffer.from(c) : (c as Buffer));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

export function sendJson(
  res: ApiResponse,
  status: number,
  payload: unknown,
): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
  }
}

/**
 * Small wrapper that turns thrown errors into clean JSON responses without
 * leaking server-side details to the client.
 */
export function withErrorBoundary(handler: ApiHandler): ApiHandler {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.code });
        return;
      }
      // Never echo back internal error details.
      // eslint-disable-next-line no-console
      console.error('[api]', (err as Error).message);
      sendJson(res, 500, { error: 'internal_error' });
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Security middleware
// ─────────────────────────────────────────────────────────────────────────

/** Maximum request body size in bytes (10 MB — base64 images are large). */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

/** Rate limit: max requests per IP within a sliding window. */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const hits = new Map<string, number[]>();

function clientIp(req: ApiRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE_MAX;
}

/** Set CORS headers. Returns false (and ends the response) for blocked origins / preflight. */
function applyCors(req: ApiRequest, res: ApiResponse): boolean {
  const allowed = process.env.CORS_ALLOWED_ORIGIN ?? '';
  const origin = (req.headers.origin ?? '') as string;

  if (allowed && origin && origin !== allowed) {
    sendJson(res, 403, { error: 'forbidden_origin' });
    return false;
  }

  const effectiveOrigin = allowed || origin || '*';
  res.setHeader('access-control-allow-origin', effectiveOrigin);
  res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type, x-api-key');
  res.setHeader('access-control-max-age', '86400');
  res.setHeader('vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return false;
  }
  return true;
}

/** Check the x-api-key header. Skipped when API_SECRET is not configured. */
function checkApiKey(req: ApiRequest): boolean {
  const secret = process.env.API_SECRET;
  if (!secret) return true;
  return req.headers['x-api-key'] === secret;
}

/** Check Content-Length against MAX_BODY_BYTES. */
function checkBodySize(req: ApiRequest): boolean {
  const cl = req.headers['content-length'];
  if (cl && parseInt(cl, 10) > MAX_BODY_BYTES) return false;
  return true;
}

/**
 * Composable security wrapper: CORS → body limit → rate limit → auth → handler.
 * Wraps everything inside `withErrorBoundary`.
 *
 * NOTE: the in-memory rate limiter resets on each cold start (Vercel serverless).
 * For production use, consider Vercel WAF or an external rate-limit store.
 */
export function withSecurity(handler: ApiHandler): ApiHandler {
  return withErrorBoundary(async (req, res) => {
    if (!applyCors(req, res)) return;

    if (!checkBodySize(req)) {
      sendJson(res, 413, { error: 'payload_too_large' });
      return;
    }

    const ip = clientIp(req);
    if (isRateLimited(ip)) {
      res.setHeader('retry-after', '60');
      sendJson(res, 429, { error: 'rate_limited' });
      return;
    }

    if (!checkApiKey(req)) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }

    await handler(req, res);
  });
}
