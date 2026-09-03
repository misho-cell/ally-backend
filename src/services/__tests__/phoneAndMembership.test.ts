jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { normalizePhone, phoneDigits } from '../phone';
import { accountStateFor, fetchAccountStates, isMemberPhone } from '../tools/membership';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('normalizePhone', () => {
  it.each([
    ['+995599123456', '+995599123456'],
    ['995599123456', '+995599123456'],
    ['599 12 34 56', '+995599123456'],
    ['0599 12 34 56', '+995599123456'], // trunk zero — the Lika-shaped mismatch
    ['+995 599-12-34-56', '+995599123456'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});

describe('membership is format-independent on both sides', () => {
  it('queries by digits and matches an account stored in ANY format', async () => {
    // The row was written years ago as "995599123456" (no plus) — the exact
    // shape that used to read as non-member forever.
    mockQuery.mockResolvedValue({
      rows: [{ phone: '995599123456', netai_user: true }],
      rowCount: 1,
    } as never);

    const states = await fetchAccountStates(['+995 599 12 34 56']);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(`regexp_replace(up.phone, '\\D', '', 'g') = ANY($1)`);
    expect(params[0]).toEqual(['995599123456']);
    expect(isMemberPhone(states, '+995599123456')).toBe(true);
    expect(isMemberPhone(states, '599 12 34 56')).toBe(true);
    expect(isMemberPhone(states, '0599123456')).toBe(true);
    expect(isMemberPhone(states, '+995599000000')).toBe(false);
  });

  it('returns an empty map without querying for no phones', async () => {
    const states = await fetchAccountStates([]);
    expect(states.size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

// Rule 13 (founder D102, 3 September): an account is not a user. On 3 Sep
// 62,184 accounts read is_member true and 42 of them had ever used Netai.
describe('the three account states', () => {
  it('an old-Ally account that never opened Netai is NOT a member — it is a target', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ phone: '995599123456', netai_user: false }],
      rowCount: 1,
    } as never);

    const states = await fetchAccountStates(['+995599123456']);

    expect(accountStateFor(states, '+995599123456')).toBe('ally_account');
    expect(isMemberPhone(states, '+995599123456')).toBe(false);
  });

  it('a phone with no account at all reads none', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    const states = await fetchAccountStates(['+995599123456']);

    expect(accountStateFor(states, '+995599123456')).toBe('none');
  });

  it("one Netai signal on any of a person's rows makes them a Netai user", async () => {
    // Same person, two phone rows; the query returns them in the unhelpful
    // order. Whichever arrives first, the answer must be netai_user.
    mockQuery.mockResolvedValue({
      rows: [
        { phone: '995599123456', netai_user: false },
        { phone: '+995 599 12 34 56', netai_user: true },
      ],
      rowCount: 2,
    } as never);

    const states = await fetchAccountStates(['+995599123456']);

    expect(accountStateFor(states, '+995599123456')).toBe('netai_user');
  });

  it('counts a subscription and a search, not only a thread, as having used Netai', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await fetchAccountStates(['+995599123456']);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FROM threads t');
    expect(sql).toContain('FROM search_activity sa');
    expect(sql).toContain('u.subscription_status = ANY($2::text[])');
    expect(params[1]).toEqual(['active', 'trialing', 'past_due']);
  });
});

describe('phoneDigits', () => {
  it('produces the digits-only canonical key', () => {
    expect(phoneDigits('+995 599-12-34-56')).toBe('995599123456');
    expect(phoneDigits('0599123456')).toBe('995599123456');
    expect(phoneDigits('')).toBe('');
  });
});
