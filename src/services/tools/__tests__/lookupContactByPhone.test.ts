jest.mock('../../../db/postgres/client', () => ({
  query: jest.fn(),
  __esModule: true,
}));

import { query } from '../../../db/postgres/client';
import { lookupContactByPhone } from '../lookupContactByPhone';

const mockQuery = query as jest.MockedFunction<typeof query>;

const mockRow = {
  name: 'გიორგი',
  alias: 'გიო',
  phone: '+995555123456',
  email: 'g@test.ge',
  city: 'Tbilisi',
  jobPosition: 'Engineer',
  employer: 'TBC Bank',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('lookupContactByPhone', () => {
  it('returns contact details when phone found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as never);

    const result = (await lookupContactByPhone('+995555123456')) as Record<string, unknown>;

    expect(result.found).toBe(true);
    expect(result.city).toBe('Tbilisi');
    expect(result.employer).toBe('TBC Bank');
    expect(result.jobPosition).toBe('Engineer');
  });

  it('prefers alias over registered name', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as never);

    const result = (await lookupContactByPhone('+995555123456')) as Record<string, unknown>;

    expect(result.name).toBe('გიო');
  });

  it('uses registered name when alias is null', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...mockRow, alias: null }],
      rowCount: 1,
    } as never);

    const result = (await lookupContactByPhone('+995555123456')) as Record<string, unknown>;

    expect(result.name).toBe('გიორგი');
  });

  it('returns found: false when phone not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const result = (await lookupContactByPhone('+999000000000')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(result.phone).toBe('+999000000000');
  });

  it('queries with normalized phone variants', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await lookupContactByPhone('+995 555 12-34-56');

    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['+995555123456']),
    );
  });

  /**
   * A SEARCH THAT COULD NOT RUN IS NOT AN EMPTY RESULT, and this test used to
   * assert the opposite: `found: false` plus the raw database string. That is
   * the same shape the tool returns when nobody matched, so the model read a
   * timeout as „nobody is there" — measured 51 times in seven days on the
   * second-degree opening search alone.
   */
  it('says the search DID NOT FINISH, and never leaks the database string', async () => {
    mockQuery.mockRejectedValue(new Error('canceling statement due to statement timeout') as never);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = (await lookupContactByPhone('+995555123456')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(result.reason).toBe('search_timed_out');
    expect(String(result.note)).toContain('DID NOT FINISH');
    expect(String(result.note)).toContain('Do NOT tell the user nobody was found');
    // CLAUDE.md: a raw DB error never reaches a client, and this one reaches
    // the model, which then has to explain it to a person.
    expect(JSON.stringify(result)).not.toContain('canceling statement');
    expect(result.error).toBeUndefined();
    consoleSpy.mockRestore();
  });

  it('a fault that is not a timeout is still not an empty result', async () => {
    mockQuery.mockRejectedValue(new Error('connection terminated') as never);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = (await lookupContactByPhone('+995555123456')) as Record<string, unknown>;

    expect(result.reason).toBe('search_failed');
    expect(JSON.stringify(result)).not.toContain('connection terminated');
    consoleSpy.mockRestore();
  });
});
