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
