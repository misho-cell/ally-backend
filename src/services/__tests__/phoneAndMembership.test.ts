jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { normalizePhone, phoneDigits } from '../phone';
import { fetchMembersForPhones, isMemberPhone } from '../tools/membership';

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
  it('queries by digits and matches a member stored in ANY format', async () => {
    // The member's row was written years ago as "995599123456" (no plus) —
    // the exact shape that used to read as non-member forever.
    mockQuery.mockResolvedValue({
      rows: [{ phone: '995599123456' }],
      rowCount: 1,
    } as never);

    const members = await fetchMembersForPhones(['+995 599 12 34 56']);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(`regexp_replace(up.phone, '\\D', '', 'g') = ANY($1)`);
    expect(params[0]).toEqual(['995599123456']);
    expect(isMemberPhone(members, '+995599123456')).toBe(true);
    expect(isMemberPhone(members, '599 12 34 56')).toBe(true);
    expect(isMemberPhone(members, '0599123456')).toBe(true);
    expect(isMemberPhone(members, '+995599000000')).toBe(false);
  });

  it('returns an empty set without querying for no phones', async () => {
    const members = await fetchMembersForPhones([]);
    expect(members.size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('phoneDigits', () => {
  it('produces the digits-only canonical key', () => {
    expect(phoneDigits('+995 599-12-34-56')).toBe('995599123456');
    expect(phoneDigits('0599123456')).toBe('995599123456');
    expect(phoneDigits('')).toBe('');
  });
});
