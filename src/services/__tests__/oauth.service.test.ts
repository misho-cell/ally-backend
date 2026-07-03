jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import crypto from 'crypto';
import { query } from '../../db/postgres/client';
import {
  createAuthorizationCode,
  exchangeAuthorizationCode,
  isOAuthAccessToken,
  refreshTokens,
  registerClient,
  validateAccessToken,
  verifyPkce,
} from '../oauth.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

function challengeFor(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('verifyPkce', () => {
  it('accepts the matching verifier and rejects the rest', () => {
    const verifier = 'a'.repeat(43);
    expect(verifyPkce(verifier, challengeFor(verifier))).toBe(true);
    expect(verifyPkce('b'.repeat(43), challengeFor(verifier))).toBe(false);
    expect(verifyPkce(verifier, 'not-a-challenge')).toBe(false);
  });
});

describe('registerClient', () => {
  it('stores and returns a generated client id', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    const client = await registerClient('Claude', ['https://claude.ai/api/mcp/auth_callback']);

    expect(client.clientId).toMatch(/^[0-9a-f-]{36}$/);
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[1]).toBe('Claude');
    expect(params[2]).toEqual(['https://claude.ai/api/mcp/auth_callback']);
  });
});

describe('createAuthorizationCode / exchangeAuthorizationCode', () => {
  const CLIENT = 'client-1';
  const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
  const VERIFIER = 'v'.repeat(43);

  it('never stores the raw code, only its hash', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    const code = await createAuthorizationCode(CLIENT, '7', REDIRECT, challengeFor(VERIFIER), null);

    expect(code.startsWith('ac_')).toBe(true);
    const storedHash = (mockQuery.mock.calls[0][1] as unknown[])[0] as string;
    expect(storedHash).not.toContain(code);
    expect(storedHash).toBe(crypto.createHash('sha256').update(code).digest('hex'));
  });

  function codeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      client_id: CLIENT,
      user_id: '7',
      redirect_uri: REDIRECT,
      code_challenge: challengeFor(VERIFIER),
      scope: null,
      expired: false,
      ...overrides,
    };
  }

  it('exchanges a valid code for tokens', async () => {
    mockQuery.mockResolvedValueOnce(rows([codeRow()]) as never); // DELETE ... RETURNING
    mockQuery.mockResolvedValueOnce(rows([]) as never); // token INSERT

    const outcome = await exchangeAuthorizationCode('ac_x', CLIENT, REDIRECT, VERIFIER);

    expect(typeof outcome).toBe('object');
    const tokens = outcome as { accessToken: string; refreshToken: string; expiresIn: number };
    expect(tokens.accessToken.startsWith('aat_')).toBe(true);
    expect(tokens.refreshToken.startsWith('art_')).toBe(true);
    expect(tokens.expiresIn).toBe(3600);
  });

  it('rejects unknown, expired, mismatched and non-PKCE exchanges', async () => {
    mockQuery.mockResolvedValueOnce(rows([]) as never);
    expect(await exchangeAuthorizationCode('ac_x', CLIENT, REDIRECT, VERIFIER)).toBe(
      'invalid_code',
    );

    mockQuery.mockResolvedValueOnce(rows([codeRow({ expired: true })]) as never);
    expect(await exchangeAuthorizationCode('ac_x', CLIENT, REDIRECT, VERIFIER)).toBe(
      'expired_code',
    );

    mockQuery.mockResolvedValueOnce(rows([codeRow({ client_id: 'other' })]) as never);
    expect(await exchangeAuthorizationCode('ac_x', CLIENT, REDIRECT, VERIFIER)).toBe(
      'client_mismatch',
    );

    mockQuery.mockResolvedValueOnce(
      rows([codeRow({ redirect_uri: 'https://evil.example' })]) as never,
    );
    expect(await exchangeAuthorizationCode('ac_x', CLIENT, REDIRECT, VERIFIER)).toBe(
      'redirect_mismatch',
    );

    mockQuery.mockResolvedValueOnce(rows([codeRow()]) as never);
    expect(await exchangeAuthorizationCode('ac_x', CLIENT, REDIRECT, 'wrong-verifier-aaaa')).toBe(
      'pkce_failed',
    );
  });

  it('burns the code on every exchange attempt (DELETE, not SELECT)', async () => {
    mockQuery.mockResolvedValueOnce(rows([codeRow({ client_id: 'other' })]) as never);
    await exchangeAuthorizationCode('ac_x', CLIENT, REDIRECT, VERIFIER);
    expect(String(mockQuery.mock.calls[0][0])).toContain('DELETE FROM oauth_auth_codes');
  });
});

describe('refreshTokens', () => {
  it('rotates: revokes the old grant and issues a new pair', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ user_id: '7', scope: null }]) as never); // UPDATE ... RETURNING
    mockQuery.mockResolvedValueOnce(rows([]) as never); // INSERT

    const outcome = await refreshTokens('art_old', 'client-1');

    expect(outcome).not.toBeNull();
    expect(String(mockQuery.mock.calls[0][0])).toContain('SET revoked_at = NOW()');
  });

  it('rejects revoked/expired/foreign refresh tokens', async () => {
    mockQuery.mockResolvedValueOnce(rows([]) as never);
    expect(await refreshTokens('art_old', 'client-1')).toBeNull();
  });
});

describe('validateAccessToken', () => {
  it('resolves a live token to its user and rejects non-oauth shapes fast', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ user_id: '7' }]) as never);
    expect(await validateAccessToken('aat_live')).toBe('7');

    expect(await validateAccessToken('eyJhbGciOi.jwt.token')).toBeNull();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown tokens', async () => {
    mockQuery.mockResolvedValueOnce(rows([]) as never);
    expect(await validateAccessToken('aat_dead')).toBeNull();
  });
});

describe('isOAuthAccessToken', () => {
  it('distinguishes oauth tokens from JWTs', () => {
    expect(isOAuthAccessToken('aat_x')).toBe(true);
    expect(isOAuthAccessToken('eyJhbGciOi')).toBe(false);
  });
});
