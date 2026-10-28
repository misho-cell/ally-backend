jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { testSeatReachesARealPerson } from '../taskAsks.service';

/**
 * Tester 77396 (28 Oct 08:48Z): a fictional seat approved an old plan and its
 * ask reached a real member. Founder's rule (23 Oct): a test seat asks test
 * people only. The wall stands where every ask is written.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const rows = (r: unknown[]): never => ({ rows: r, rowCount: r.length }) as never;

beforeEach(() => jest.clearAllMocks());

describe('a test seat never asks a real person', () => {
  it('refuses a seat asking a real number nobody of ours holds', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ seat: true }]))
      .mockResolvedValueOnce(rows([{ ours: false }]));
    expect(await testSeatReachesARealPerson('195548', '+995599118877')).toBe(true);
  });

  it('lets a seat ask another seat or a reserved fictional number', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ seat: true }]))
      .mockResolvedValueOnce(rows([{ ours: true }]));
    expect(await testSeatReachesARealPerson('195548', '+995599000710')).toBe(false);
    expect(await testSeatReachesARealPerson('195548', '+441632960101')).toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('never stands in a real member’s way', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ seat: false }]));
    expect(await testSeatReachesARealPerson('3222', '+995599118877')).toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('is checked in createAskNow before anything is written', () => {
    const src = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    const fn = src.slice(src.indexOf('async function createAskNow('));
    const guard = fn.indexOf('await testSeatReachesARealPerson(fromUserId, contactPhone)');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(fn.indexOf('INSERT INTO task_asks'));
    expect(guard).toBeLessThan(fn.indexOf('await saveThreadMessage('));
  });
});
