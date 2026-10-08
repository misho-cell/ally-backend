jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { isDeceasedOrBlockedFor } from '../block.service';

/**
 * 3268 (MASTER TEST RUN ME-005, 2 of 2): a contact the owner marked deceased
 * was asked on the server's own order-to-ask path, and a new plan proposed him.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

beforeEach(() => mockQuery.mockReset());

describe('the deceased and blocked check', () => {
  it('reads both marks for this owner, by digits, once', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ hit: 1 }] } as never);
    expect(await isDeceasedOrBlockedFor('180090', '+995 599 11 22 33')).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FROM "ContactDeceased"');
    expect(sql).toContain('FROM "UserBlock"');
    expect(sql).toContain('LIMIT 1');
    expect(params).toEqual(['180090', '995599112233']);
  });

  it('nobody marked: false; no digits: false without a read', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    expect(await isDeceasedOrBlockedFor('180090', '+995599112233')).toBe(false);
    expect(await isDeceasedOrBlockedFor('180090', '')).toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe('every path', () => {
  it('a question is refused before anything else, whoever sends it', () => {
    const top = asks.slice(asks.indexOf('async function createAskNow('));
    const check = top.indexOf('await isDeceasedOrBlockedFor(fromUserId, contactPhone)');
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(top.indexOf('planRowFor(taskId)'));
    expect(asks).toContain("reason: 'recipient_excluded'");
  });

  it('a plan naming such a person is refused with their name', () => {
    expect(chat).toContain('const excludedInPlan = await excludedPeopleInPlan(userId, input[');
    expect(chat).toContain('return { proposed: false, error: planNamesExcluded(excludedInPlan) };');
  });
});
