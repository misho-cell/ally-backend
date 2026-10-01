jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import bcrypt from 'bcrypt';
import { query, withTransaction } from '../../db/postgres/client';
import { createStaffAccount, staffEmail, StaffAccountRefusal } from '../staffAccounts.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockTx = withTransaction as jest.MockedFunction<typeof withTransaction>;

/**
 * M1 (plate v288; Misho, 1 October): admin logins of their own for Misho, Gio,
 * Lika and Ninia — separate accounts made only for the admin panel, so their
 * Netai accounts are not touched — and each entry shows who made it.
 */
const clientQuery = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
  clientQuery.mockImplementation((sql: string) =>
    Promise.resolve(
      String(sql).includes('INSERT INTO "User"') ? { rows: [{ id: 900001 }] } : { rows: [] },
    ),
  );
  mockTx.mockImplementation(((fn: (c: unknown) => unknown) => fn({ query: clientQuery })) as never);
});

const INPUT = {
  name: ' Gio ',
  email: ' Gio@AllyApp.one ',
  password: 'a-long-password-1',
  createdBy: '167250',
};

describe('a staff account', () => {
  it('is one admin-only User row plus its staff_accounts mark, in one transaction', async () => {
    const created = await createStaffAccount(INPUT);

    expect(created).toEqual({ user_id: 900001, name: 'Gio', email: 'gio@allyapp.one' });
    expect(mockTx).toHaveBeenCalledTimes(1);
    const [userSql, userParams] = clientQuery.mock.calls[0];
    expect(String(userSql)).toContain('"hasAccessToAlly"');
    expect(userParams[0]).toBe('Gio');
    expect(userParams[1]).toBe('gio@allyapp.one');
    const [markSql, markParams] = clientQuery.mock.calls[1];
    expect(String(markSql)).toContain('INSERT INTO staff_accounts');
    expect(markParams).toEqual([900001, 'Gio', '167250']);
  });

  it('stores only a bcrypt hash of the password, never the password', async () => {
    await createStaffAccount(INPUT);
    const hash = String(clientQuery.mock.calls[0][1][2]);
    expect(hash).not.toContain('a-long-password-1');
    expect(await bcrypt.compare('a-long-password-1', hash)).toBe(true);
  });

  it('refuses an email any account already uses — login looks accounts up by email', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 5 }], rowCount: 1 } as never);
    expect(await createStaffAccount(INPUT)).toBe(StaffAccountRefusal.EmailTaken);
    expect(mockTx).not.toHaveBeenCalled();
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('lower(email) = $1');
    expect(params).toEqual(['gio@allyapp.one']);
    expect(timeout).toBeGreaterThan(0);
  });

  it('refuses a short password before anything is read or written', async () => {
    expect(await createStaffAccount({ ...INPUT, password: 'short' })).toBe(
      StaffAccountRefusal.PasswordTooShort,
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('compares emails trimmed and in lower case', () => {
    expect(staffEmail('  Misho@AllyApp.One ')).toBe('misho@allyapp.one');
  });
});

describe('where it is wired', () => {
  const route = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
    'utf8',
  );
  const handler = route.slice(route.indexOf("'/staff-accounts'"));

  it('is an admin route that never logs or returns the password', () => {
    const body = handler.slice(0, 2200);
    expect(body).toContain('createStaffAccount(');
    expect(body).toContain('status(409)');
    expect(body).toContain('status(201)');
    expect(body).not.toMatch(/console\.log\([^)]*password/);
  });

  it('keeps staff accounts out of the attribution watcher’s count of signups', () => {
    const watcher = readFileSync(
      join(__dirname, '..', '..', '..', 'scripts', 'ops', 'attribution.sh'),
      'utf8',
    );
    expect(watcher).toContain(
      'NOT EXISTS (SELECT 1 FROM staff_accounts sa WHERE sa.user_id = u.id)',
    );
  });
});
