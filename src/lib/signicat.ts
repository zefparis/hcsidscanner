/**
 * Signicat eID Hub — OIDC client config (Authorization Code flow with PKCE).
 *
 * The token exchange itself happens server-side in `api/token-exchange.ts`
 * to keep `SIGNICAT_CLIENT_SECRET` out of the bundle. This module only
 * builds the authorize URL and PKCE verifier/challenge.
 */

const baseUrl =
  import.meta.env.VITE_SIGNICAT_BASE_URL ?? 'https://sandbox.signicat.com';
const clientId =
  import.meta.env.VITE_SIGNICAT_CLIENT_ID ?? 'sandbox-spicy-picture-960';
const scope =
  import.meta.env.VITE_SIGNICAT_SCOPE ?? 'openid profile document';
const redirectUri =
  import.meta.env.VITE_REDIRECT_URI ?? `${window.location.origin}/callback`;

export const SIGNICAT = {
  baseUrl,
  clientId,
  scope,
  redirectUri,
  authorizeEndpoint: `${baseUrl}/auth/open/connect/authorize`,
  tokenEndpoint: `${baseUrl}/auth/open/connect/token`,
} as const;

const STORAGE_KEY_VERIFIER = 'signicat_pkce_verifier';
const STORAGE_KEY_STATE = 'signicat_oauth_state';

/**
 * Random URL-safe string (RFC 7636 § 4.1, length 43–128).
 */
function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function s256(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Builds the Signicat authorize URL and stashes PKCE/state in sessionStorage
 * so the callback can retrieve them.
 */
export async function buildAuthorizeUrl(): Promise<string> {
  const verifier = randomBase64Url(32);
  const challenge = await s256(verifier);
  const state = randomBase64Url(16);

  sessionStorage.setItem(STORAGE_KEY_VERIFIER, verifier);
  sessionStorage.setItem(STORAGE_KEY_STATE, state);

  const params = new URLSearchParams({
    client_id: SIGNICAT.clientId,
    scope: SIGNICAT.scope,
    response_type: 'code',
    redirect_uri: SIGNICAT.redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  return `${SIGNICAT.authorizeEndpoint}?${params.toString()}`;
}

export function consumePkceVerifier(): string | null {
  const v = sessionStorage.getItem(STORAGE_KEY_VERIFIER);
  sessionStorage.removeItem(STORAGE_KEY_VERIFIER);
  return v;
}

export function consumeExpectedState(): string | null {
  const s = sessionStorage.getItem(STORAGE_KEY_STATE);
  sessionStorage.removeItem(STORAGE_KEY_STATE);
  return s;
}
