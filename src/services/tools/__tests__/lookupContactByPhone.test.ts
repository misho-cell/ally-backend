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

  it('returns found: false with error on DB failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = (await lookupContactByPhone('+995555123456')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(result.error).toBe('timeout');
    consoleSpy.mockRestore();
  });
});
