const mockSetTeamAccountExcluded = jest.fn();
const mockListTeamAccounts = jest.fn();
jest.mock('../../../services/excludedHolders.service', () => {
  const actual = jest.requireActual('../../../services/excludedHolders.service');
  return {
    ...actual,
    setTeamAccountExcluded: (...args: unknown[]) => mockSetTeamAccountExcluded(...args),
    listTeamAccounts: (...args: unknown[]) => mockListTeamAccounts(...args),
  };
});
const mockVerifyToken = jest.fn();
jest.mock('../../../services/auth.service', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));
const mockRecordProductEvent = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../services/productEvents.service', () => ({
  recordProductEvent: (...args: unknown[]) => mockRecordProductEvent(...args),
}));

import express from 'express';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TeamAccountExclusion } from '../../../services/excludedHolders.service';
import { teamAccountsRouter } from '../teamAccounts.routes';

/** Fictional ids only. */
const ADMIN_ID = '900100';
const ACCOUNT = 900001;

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/admin/team-accounts', teamAccountsRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/admin/team-accounts`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const ADMIN_TOKEN = 'admin-token';
const USER_TOKEN = 'user-token';

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyToken.mockImplementation((token: string) => {
    if (token === ADMIN_TOKEN) return { userId: ADMIN_ID, role: 'admin' };
    if (token === USER_TOKEN) return { userId: '900200', role: 'user' };
    throw new Error('invalid token');
  });
});

async function put(
  path: string,
  payload: unknown,
  token: string | null = ADMIN_TOKEN,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${base}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json() };
}

describe('PUT /admin/team-accounts/:userId', () => {
  it('marks a team account and records who did it', async () => {
    mockSetTeamAccountExcluded.mockResolvedValueOnce(TeamAccountExclusion.Set);

    const res = await put(`/${ACCOUNT}`, { excluded: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { user_id: ACCOUNT, outcome: TeamAccountExclusion.Set },
    });
    expect(mockSetTeamAccountExcluded).toHaveBeenCalledWith(ACCOUNT, true);
    expect(mockRecordProductEvent).toHaveBeenCalledWith(ADMIN_ID, 'team_account_exclusion', {
      target_user_id: ACCOUNT,
      excluded: true,
    });
  });

  it('clears a team account', async () => {
    mockSetTeamAccountExcluded.mockResolvedValueOnce(TeamAccountExclusion.Cleared);

    const res = await put(`/${ACCOUNT}`, { excluded: false });

    expect(res.status).toBe(200);
    expect(mockSetTeamAccountExcluded).toHaveBeenCalledWith(ACCOUNT, false);
  });

  it.each([
    ['a non-numeric id', '/abc', { excluded: true }],
    ['a zero id', '/0', { excluded: true }],
    ['a missing flag', `/${ACCOUNT}`, {}],
    ['a flag that is not a boolean', `/${ACCOUNT}`, { excluded: 'yes' }],
  ])('answers %s with 400 and touches nothing', async (_label, path, payload) => {
    const res = await put(path, payload);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false });
    expect(mockSetTeamAccountExcluded).not.toHaveBeenCalled();
    expect(mockRecordProductEvent).not.toHaveBeenCalled();
  });

  it.each([
    [TeamAccountExclusion.NoSuchUser, 404],
    [TeamAccountExclusion.NotATeamAccount, 404],
    [TeamAccountExclusion.ExcludedForAnotherReason, 409],
  ])('answers %s with %i and records no event', async (outcome, status) => {
    mockSetTeamAccountExcluded.mockResolvedValueOnce(outcome);

    const res = await put(`/${ACCOUNT}`, { excluded: true });

    expect(res.status).toBe(status);
    expect(res.body).toMatchObject({ success: false });
    expect(mockRecordProductEvent).not.toHaveBeenCalled();
  });

  it('answers a failure with 500 and never shows the database error', async () => {
    mockSetTeamAccountExcluded.mockRejectedValueOnce(new Error('relation does not exist'));

    const res = await put(`/${ACCOUNT}`, { excluded: true });

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('relation');
  });
});

describe('GET /admin/team-accounts', () => {
  it('lists the team accounts, ids only', async () => {
    mockListTeamAccounts.mockResolvedValueOnce([ACCOUNT]);

    const response = await fetch(base, { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { user_ids: [ACCOUNT] } });
  });

  it('answers a failure with 500', async () => {
    mockListTeamAccounts.mockRejectedValueOnce(new Error('timeout'));

    const response = await fetch(base, { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } });

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ success: false });
  });
});

describe('who may use it', () => {
  it('refuses a request with no token with 401', async () => {
    const res = await put(`/${ACCOUNT}`, { excluded: true }, null);

    expect(res.status).toBe(401);
    expect(mockSetTeamAccountExcluded).not.toHaveBeenCalled();
  });

  it('refuses a member token with 403', async () => {
    const res = await put(`/${ACCOUNT}`, { excluded: true }, USER_TOKEN);

    expect(res.status).toBe(403);
    expect(mockSetTeamAccountExcluded).not.toHaveBeenCalled();
  });

  it('refuses the listing to a member token with 403', async () => {
    const response = await fetch(base, { headers: { Authorization: `Bearer ${USER_TOKEN}` } });

    expect(response.status).toBe(403);
    expect(mockListTeamAccounts).not.toHaveBeenCalled();
  });
});

describe('where the route lives', () => {
  it('is mounted inside the admin router, after its admin authentication', () => {
    const routes = readFileSync(join(__dirname, '..', 'admin.routes.ts'), 'utf8');
    const auth = routes.indexOf('adminRouter.use(authenticateJwt, requireAdminRole);');
    const mount = routes.indexOf("adminRouter.use('/team-accounts', teamAccountsRouter);");
    expect(auth).toBeGreaterThan(-1);
    expect(mount).toBeGreaterThan(auth);
  });
});
