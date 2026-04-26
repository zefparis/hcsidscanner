/**
 * POST /api/token-exchange
 *
 * Server-side OIDC code → token exchange for Signicat.
 * Reasons this lives server-side:
 *   1. SIGNICAT_CLIENT_SECRET must NEVER be in the bundle.
 *   2. The raw access_token is not handed to the client; only a curated
 *      claims subset is returned.
 *
 * Body: { code: string, redirect_uri: string, code_verifier: string }
 * 200:  { claims: SignicatClaims }
 * 4xx:  { error: 'invalid_request' | 'token_exchange_failed' | 'userinfo_failed' }
 */

import type { SignicatClaims } from '../src/types.js';
import {
  HttpError,
  readJson,
  sendJson,
  withErrorBoundary,
  type ApiHandler,
} from './_helpers.js';

interface ExchangeBody {
  code?: string;
  redirect_uri?: string;
  code_verifier?: string;
}

interface TokenResponse {
  access_token: string;
  id_token?: string;
  token_type: string;
}

const ALLOWED_CLAIM_KEYS: readonly string[] = [
  'sub',
  'given_name',
  'family_name',
  'birthdate',
  'document_number',
  'document_type',
  'expiry_date',
  'nationality',
  'portrait',
  'verified_at',
];

function pickClaims(raw: Record<string, unknown>): SignicatClaims {
  const out: Record<string, unknown> = {};
  for (const k of ALLOWED_CLAIM_KEYS) {
    if (raw[k] !== undefined) out[k] = raw[k];
  }
  return out as unknown as SignicatClaims;
}

const handler: ApiHandler = async (req, res) => {
  if (req.method !== 'POST') {
    throw new HttpError(405, 'method_not_allowed');
  }

  const { code, redirect_uri, code_verifier } =
    await readJson<ExchangeBody>(req);

  if (!code || !redirect_uri || !code_verifier) {
    throw new HttpError(400, 'invalid_request');
  }

  const baseUrl =
    process.env.SIGNICAT_BASE_URL ??
    'https://ia-solution.sandbox.signicat.com';
  const clientId = process.env.SIGNICAT_CLIENT_ID;
  const clientSecret = process.env.SIGNICAT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new HttpError(500, 'server_misconfigured');
  }

  // ── 1. Code → tokens ───────────────────────────────────────────────────
  const tokenRes = await fetch(`${baseUrl}/auth/open/connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri,
      code_verifier,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!tokenRes.ok) {
    throw new HttpError(502, 'token_exchange_failed');
  }
  const tokens = (await tokenRes.json()) as TokenResponse;

  // ── 2. UserInfo (richer claims, including the chip portrait) ──────────
  const userInfoRes = await fetch(`${baseUrl}/auth/open/connect/userinfo`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userInfoRes.ok) {
    throw new HttpError(502, 'userinfo_failed');
  }
  const rawClaims = (await userInfoRes.json()) as Record<string, unknown>;

  const claims = pickClaims(rawClaims);
  // Stamp verification time if the IdP didn't supply one.
  if (!claims.verified_at) {
    claims.verified_at = new Date().toISOString();
  }

  sendJson(res, 200, { claims });
};

export default withErrorBoundary(handler);
