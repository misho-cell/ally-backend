import express, { Request, Response, Router } from 'express';
import { PUBLIC_BASE_URL } from '../../config/publicUrl';
import { query } from '../../db/postgres/client';
import { requestOTP, verifyOTP } from '../../services/auth.service';
import {
  createAuthorizationCode,
  exchangeAuthorizationCode,
  getClient,
  refreshTokens,
  registerClient,
} from '../../services/oauth.service';
import { rateLimit } from '../middleware/rateLimit.middleware';
import {
  AuthorizePageParams,
  renderCodePage,
  renderErrorPage,
  renderPhonePage,
} from './oauthPages';

// OAuth 2.1 endpoints for the MCP connector: discovery, dynamic client
// registration, the phone+OTP authorize flow, and the token endpoint.

const OAUTH_RATE_WINDOW_MS = 5 * 60_000;
const OAUTH_RATE_MAX = 60;
const MAX_REDIRECT_URIS = 5;
const PHONE_LOOKUP_TIMEOUT_MS = 5_000;
const SUPPORTED_CHALLENGE_METHOD = 'S256';

export const wellKnownRouter = Router();

const authServerMetadata = {
  issuer: PUBLIC_BASE_URL,
  authorization_endpoint: `${PUBLIC_BASE_URL}/oauth/authorize`,
  token_endpoint: `${PUBLIC_BASE_URL}/oauth/token`,
  registration_endpoint: `${PUBLIC_BASE_URL}/oauth/register`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: [SUPPORTED_CHALLENGE_METHOD],
  token_endpoint_auth_methods_supported: ['none'],
  scopes_supported: ['ally'],
};

const protectedResourceMetadata = {
  resource: `${PUBLIC_BASE_URL}/mcp`,
  authorization_servers: [PUBLIC_BASE_URL],
  bearer_methods_supported: ['header'],
};

wellKnownRouter.get('/oauth-authorization-server', (req: Request, res: Response) => {
  res.json(authServerMetadata);
});
// Some clients append the resource path to the well-known URL (RFC 9728) —
// serve both shapes.
wellKnownRouter.get(
  ['/oauth-protected-resource', '/oauth-protected-resource/mcp'],
  (req: Request, res: Response) => {
    res.json(protectedResourceMetadata);
  },
);

const oauthRouter = Router();
oauthRouter.use(express.urlencoded({ extended: false }));
oauthRouter.use(rateLimit({ windowMs: OAUTH_RATE_WINDOW_MS, max: OAUTH_RATE_MAX }));

function isAcceptableRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (url.protocol === 'https:') return true;
    // Plain http only for local development clients (MCP inspector, tests).
    return (
      url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    );
  } catch {
    return false;
  }
}

oauthRouter.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as { redirect_uris?: unknown; client_name?: unknown };
    const uris = Array.isArray(body.redirect_uris) ? (body.redirect_uris as unknown[]) : [];
    const redirectUris = uris.filter(
      (u): u is string => typeof u === 'string' && isAcceptableRedirectUri(u),
    );
    if (
      redirectUris.length === 0 ||
      redirectUris.length !== uris.length ||
      uris.length > MAX_REDIRECT_URIS
    ) {
      res.status(400).json({
        error: 'invalid_client_metadata',
        error_description: 'redirect_uris must be 1-5 valid https URLs',
      });
      return;
    }
    const clientName = typeof body.client_name === 'string' ? body.client_name : null;
    const client = await registerClient(clientName, redirectUris);
    res.status(201).json({
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[oauth] register failed:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

/**
 * Re-validated on every step of the authorize flow — hidden form fields are
 * client-controlled, and the redirect must only ever go to a registered URI.
 */
async function readAuthorizeParams(
  source: Record<string, unknown>,
): Promise<{ params?: AuthorizePageParams; error?: string }> {
  const clientId = typeof source.client_id === 'string' ? source.client_id : '';
  const redirectUri = typeof source.redirect_uri === 'string' ? source.redirect_uri : '';
  const codeChallenge = typeof source.code_challenge === 'string' ? source.code_challenge : '';
  const state = typeof source.state === 'string' ? source.state : '';
  const scope = typeof source.scope === 'string' ? source.scope : '';

  if (!clientId || !redirectUri || !codeChallenge) {
    return { error: 'The request is missing required OAuth parameters.' };
  }
  const client = await getClient(clientId);
  if (!client) return { error: 'Unknown client — remove and re-add the connector.' };
  if (!client.redirectUris.includes(redirectUri)) {
    return { error: 'redirect_uri does not match the registered one.' };
  }
  return { params: { clientId, redirectUri, state, codeChallenge, scope } };
}

oauthRouter.get('/authorize', async (req: Request, res: Response): Promise<void> => {
  try {
    const source = req.query as Record<string, unknown>;
    if (source.response_type !== 'code') {
      res.status(400).send(renderErrorPage('response_type must be "code"'));
      return;
    }
    const method = source.code_challenge_method ?? SUPPORTED_CHALLENGE_METHOD;
    if (method !== SUPPORTED_CHALLENGE_METHOD) {
      res.status(400).send(renderErrorPage('Only the S256 code_challenge_method is supported.'));
      return;
    }
    const { params, error } = await readAuthorizeParams(source);
    if (!params) {
      res.status(400).send(renderErrorPage(error ?? 'Invalid request.'));
      return;
    }
    res.send(renderPhonePage(params));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[oauth] authorize failed:', err);
    res.status(500).send(renderErrorPage('Server error — please try again.'));
  }
});

async function findUserIdByPhone(phone: string): Promise<string | null> {
  const variants = [phone, phone.startsWith('+') ? phone.slice(1) : `+${phone}`];
  const result = await query<{ userId: number }>(
    'SELECT "userId" FROM "UserPhone" WHERE phone = ANY($1) LIMIT 1',
    [variants],
    PHONE_LOOKUP_TIMEOUT_MS,
  );
  const userId = result.rows[0]?.userId;
  return userId === undefined ? null : String(userId);
}

oauthRouter.post('/authorize/send-code', async (req: Request, res: Response): Promise<void> => {
  try {
    const source = req.body as Record<string, unknown>;
    const { params, error } = await readAuthorizeParams(source);
    if (!params) {
      res.status(400).send(renderErrorPage(error ?? 'Invalid request.'));
      return;
    }
    const phone = typeof source.phone === 'string' ? source.phone.replace(/\s+/g, '') : '';
    if (!phone || (await findUserIdByPhone(phone)) === null) {
      res
        .status(200)
        .send(
          renderPhonePage(
            params,
            'This number is not registered with Ally — sign up in the app first.',
          ),
        );
      return;
    }
    await requestOTP(phone, 'AUTH');
    res.send(renderCodePage(params, phone));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[oauth] send-code failed:', err);
    res.status(500).send(renderErrorPage('Could not send the code — please try again.'));
  }
});

oauthRouter.post('/authorize/verify', async (req: Request, res: Response): Promise<void> => {
  const source = req.body as Record<string, unknown>;
  const { params, error } = await readAuthorizeParams(source);
  if (!params) {
    res.status(400).send(renderErrorPage(error ?? 'Invalid request.'));
    return;
  }
  const phone = typeof source.phone === 'string' ? source.phone : '';
  const code = typeof source.code === 'string' ? source.code.trim() : '';
  try {
    await verifyOTP(phone, code, 'AUTH');
  } catch {
    // The shared OTP service reports errors in Georgian — this page is English.
    res
      .status(200)
      .send(renderCodePage(params, phone, 'The code is wrong or has expired — try again.'));
    return;
  }
  try {
    const userId = await findUserIdByPhone(phone);
    if (userId === null) {
      res.status(400).send(renderErrorPage('User not found.'));
      return;
    }
    const authCode = await createAuthorizationCode(
      params.clientId,
      userId,
      params.redirectUri,
      params.codeChallenge,
      params.scope || null,
    );
    const redirect = new URL(params.redirectUri);
    redirect.searchParams.set('code', authCode);
    if (params.state) redirect.searchParams.set('state', params.state);
    res.redirect(redirect.toString());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[oauth] verify failed:', err);
    res.status(500).send(renderErrorPage('Server error — please try again.'));
  }
});

function tokenParam(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value : '';
}

async function handleAuthorizationCodeGrant(
  body: Record<string, unknown>,
  res: Response,
): Promise<void> {
  const code = tokenParam(body, 'code');
  const clientId = tokenParam(body, 'client_id');
  const redirectUri = tokenParam(body, 'redirect_uri');
  const codeVerifier = tokenParam(body, 'code_verifier');
  if (!code || !clientId || !redirectUri || !codeVerifier) {
    res.status(400).json({ error: 'invalid_request', error_description: 'missing parameters' });
    return;
  }
  const outcome = await exchangeAuthorizationCode(code, clientId, redirectUri, codeVerifier);
  if (typeof outcome === 'string') {
    res.status(400).json({ error: 'invalid_grant', error_description: outcome });
    return;
  }
  res.json({
    access_token: outcome.accessToken,
    token_type: 'Bearer',
    expires_in: outcome.expiresIn,
    refresh_token: outcome.refreshToken,
  });
}

async function handleRefreshTokenGrant(
  body: Record<string, unknown>,
  res: Response,
): Promise<void> {
  const refreshToken = tokenParam(body, 'refresh_token');
  const clientId = tokenParam(body, 'client_id');
  if (!refreshToken || !clientId) {
    res.status(400).json({ error: 'invalid_request', error_description: 'missing parameters' });
    return;
  }
  const outcome = await refreshTokens(refreshToken, clientId);
  if (outcome === null) {
    res.status(400).json({ error: 'invalid_grant', error_description: 'refresh token rejected' });
    return;
  }
  res.json({
    access_token: outcome.accessToken,
    token_type: 'Bearer',
    expires_in: outcome.expiresIn,
    refresh_token: outcome.refreshToken,
  });
}

oauthRouter.post('/token', async (req: Request, res: Response): Promise<void> => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const grantType = tokenParam(body, 'grant_type');
    if (grantType === 'authorization_code') {
      await handleAuthorizationCodeGrant(body, res);
      return;
    }
    if (grantType === 'refresh_token') {
      await handleRefreshTokenGrant(body, res);
      return;
    }
    res.status(400).json({ error: 'unsupported_grant_type' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[oauth] token failed:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

export default oauthRouter;
