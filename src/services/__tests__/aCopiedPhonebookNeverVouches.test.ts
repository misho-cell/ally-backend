const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({ query: (...a: unknown[]) => mockQuery(...a) }));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  excludedHolderPhones,
  forgetExcludedHolders,
  notAnExcludedHolder,
} from '../excludedHolders.service';

/**
 * Tester 75643/75644 (Misho's word, 24 Oct): 25 accounts carry a copy of one
 * real member's phonebook and „knew" everyone, crowding real bridges out. They
 * are never a bridge, a path link or a reverse-tie holder. Nothing is deleted.
 */
const src = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');

beforeEach(() => {
  mockQuery.mockReset();
  forgetExcludedHolders();
});

describe('an account that never vouches', () => {
  it('is left out by a fragment that names the table and the column given', () => {
    expect(notAnExcludedHolder('up."userId"')).toBe(
      'NOT EXISTS (SELECT 1 FROM excluded_holders eh WHERE eh.user_id = up."userId")',
    );
  });

  it('is filtered from second-degree bridges and reverse-tie holders', () => {
    expect(src('tools/searchSecondDegree.ts')).toContain(
      `WHERE up.phone = ANY($2) AND \${notAnExcludedHolder('up."userId"')}`,
    );
    expect(src('reverseTies.service.ts')).toContain(
      `WHERE ua."contactId" <> $1 AND \${notAnExcludedHolder('ua."contactId"')}`,
    );
    expect(src('tools/findWarmPath.ts')).toContain('...(await excludedHolderPhones()),');
  });

  it('reads their numbers once and keeps them for a while', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ phone: '+5491100000001' }] });
    const first = await excludedHolderPhones(1_000);
    const again = await excludedHolderPhones(2_000);
    expect([...first]).toEqual(['+5491100000001']);
    expect(again).toBe(first);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('excludes nothing when the list cannot be read', async () => {
    mockQuery.mockRejectedValueOnce(new Error('no table yet'));
    expect((await excludedHolderPhones(1_000)).size).toBe(0);
  });

  it('is seeded with the 25 accounts, and deletes nothing', () => {
    const sql = readFileSync(
      join(__dirname, '..', '..', 'db', 'postgres', 'migrations', '266_excluded_holders.sql'),
      'utf8',
    );
    expect(sql.match(/\b1\d{5}\b/g)?.length).toBe(25);
    expect(sql).not.toMatch(/\bDELETE\b|\bUPDATE\b/i);
  });
});
