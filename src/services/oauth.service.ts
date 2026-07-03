import crypto from 'crypto';
import { query } from '../db/postgres/client';

// OAuth 2.1 for the MCP connector: dynamic client registration, authorization
// codes with mandatory S256 PKCE, opaque bearer tokens with rotation. Only
// hashes ever touch the database; raw tokens exist only in the response that
// delivers them.

const AUTH_CODE_TTL_SECONDS = 600;
const ACCESS_TOKEN_TTL_SECONDS = 3600;
const REFRESH_TOKEN_TTL_DAYS = 30;
const TOKEN_RANDOM_BYTES = 32;
const ACCESS_TOKEN_PREFIX = 'aat_';
const REFRESH_TOKEN_PREFIX = 'art_';
const AUTH_CODE_PREFIX = 'ac_';
const OAUTH_QUERY_TIMEOUT_MS = 5_000;

export interface OAuthClient {
  clientId: string;
  clientName: string | null;
  redirectUris: string[];
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export type CodeExchangeError =
  | 'invalid_code'
  | 'expired_code'
  | 'client_mismatch'
  | 'redirect_mismatch'
  | 'pkce_failed';

function randomToken(prefix: string): string {
  return prefix + crypto.randomBytes(TOKEN_RANDOM_BYTES).toString('base64url');
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** RFC 7636 S256: BASE64URL(SHA256(verifier)) must equal the stored challenge. */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const digest = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const expected = Buffer.from(digest);
  const actual = Buffer.from(codeChallenge);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export async function registerClient(
  clientName: string | null,
  redirectUris: string[],
): Promise<OAuthClient> {
  const clientId = crypto.randomUUID();
  await query(
    `INSERT INTO oauth_clients (client_id, client_name, redirect_uris)
     VALUES ($1, $2, $3)`,
    [clientId, clientName, redirectUris],
    OAUTH_QUERY_TIMEOUT_MS,
  );
  return { clientId, clientName, redirectUris };
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  const result = await query<{
    client_id: string;
    client_name: string | null;
    redirect_uris: string[];
  }>(
    'SELECT client_id, client_name, redirect_uris FROM oauth_clients WHERE client_id = $1 LIMIT 1',
    [clientId],
    OAUTH_QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  if (!row) return null;
  return { clientId: row.client_id, clientName: row.client_name, redirectUris: row.redirect_uris };
}

export async function createAuthorizationCode(
  clientId: string,
  userId: string,
  redirectUri: string,
  codeChallenge: string,
  scope: string | null,
): Promise<string> {
  const code = randomToken(AUTH_CODE_PREFIX);
  await query(
    `INSERT INTO oauth_auth_codes
       (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW() + make_interval(secs => $7))`,
    [sha256(code), clientId, userId, redirectUri, codeChallenge, scope, AUTH_CODE_TTL_SECONDS],
    OAUTH_QUERY_TIMEOUT_MS,
  );
  return code;
}

interface AuthCodeRow {
  client_id: string;
  user_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope: string | null;
  expired: boolean;
}

/**
 * Single-use exchange: the row is deleted atomically on read, so a replayed
 * code fails even when two exchanges race. All checks run after deletion —
 * a code that fails any check is burned, per OAuth 2.1.
 */
export async function exchangeAuthorizationCode(
  code: string,
  clientId: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<IssuedTokens | CodeExchangeError> {
  const result = await query<AuthCodeRow>(
    `DELETE FROM oauth_auth_codes
     WHERE code_hash = $1
     RETURNING client_id, user_id, redirect_uri, code_challenge, scope,
               (expires_at < NOW()) AS expired`,
    [sha256(code)],
    OAUTH_QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  if (!row) return 'invalid_code';
  if (row.expired) return 'expired_code';
  if (row.client_id !== clientId) return 'client_mismatch';
  if (row.redirect_uri !== redirectUri) return 'redirect_mismatch';
  if (!verifyPkce(codeVerifier, row.code_challenge)) return 'pkce_failed';
  return issueTokens(clientId, row.user_id, row.scope);
}

export async function issueTokens(
  clientId: string,
  userId: string,
  scope: string | null,
): Promise<IssuedTokens> {
  const accessToken = randomToken(ACCESS_TOKEN_PREFIX);
  const refreshToken = randomToken(REFRESH_TOKEN_PREFIX);
  await query(
    `INSERT INTO oauth_tokens
       (access_token_hash, refresh_token_hash, client_id, user_id, scope,
        access_expires_at, refresh_expires_at)
     VALUES ($1, $2, $3, $4, $5,
             NOW() + make_interval(secs => $6),
             NOW() + make_interval(days => $7))`,
    [
      sha256(accessToken),
      sha256(refreshToken),
      clientId,
      userId,
      scope,
      ACCESS_TOKEN_TTL_SECONDS,
      REFRESH_TOKEN_TTL_DAYS,
    ],
    OAUTH_QUERY_TIMEOUT_MS,
  );
  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

/**
 * Refresh with rotation: the old grant is revoked in the same statement that
 * validates it, so a stolen refresh token can be used at most once.
 */
export async function refreshTokens(
  refreshToken: string,
  clientId: string,
): Promise<IssuedTokens | null> {
  const result = await query<{ user_id: string; scope: string | null }>(
    `UPDATE oauth_tokens
     SET revoked_at = NOW()
     WHERE refresh_token_hash = $1
       AND client_id = $2
       AND revoked_at IS NULL
       AND refresh_expires_at > NOW()
     RETURNING user_id, scope`,
    [sha256(refreshToken), clientId],
    OAUTH_QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  if (!row) return null;
  return issueTokens(clientId, row.user_id, row.scope);
}

/** Bearer check for /mcp. Returns the user id or null. */
export async function validateAccessToken(accessToken: string): Promise<string | null> {
  if (!accessToken.startsWith(ACCESS_TOKEN_PREFIX)) return null;
  const result = await query<{ user_id: string }>(
    `SELECT user_id FROM oauth_tokens
     WHERE access_token_hash = $1
       AND revoked_at IS NULL
       AND access_expires_at > NOW()
     LIMIT 1`,
    [sha256(accessToken)],
    OAUTH_QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.user_id ?? null;
}

export function isOAuthAccessToken(token: string): boolean {
  return token.startsWith(ACCESS_TOKEN_PREFIX);
}
