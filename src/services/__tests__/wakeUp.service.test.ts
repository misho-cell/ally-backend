jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { listWakeUpCandidates } from '../wakeUp.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

const ROW = {
  id: 526,
  phone: '+995599140815',
  facts: ['occupation: CEO, Arci'],
  phonebook: '2386',
  contacts_on_netai: '16',
  registered_at: '2026-03-04T10:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listWakeUpCandidates', () => {
  it('returns the counts as numbers and the date as an ISO string', async () => {
    mockQuery.mockResolvedValue(rows([ROW]) as never);

    const out = await listWakeUpCandidates();

    expect(out).toEqual([
      {
        user_id: 526,
        phone: '+995599140815',
        facts: ['occupation: CEO, Arci'],
        phonebook: 2386,
        contacts_on_netai: 16,
        registered_at: '2026-03-04T10:00:00.000Z',
      },
    ]);
  });

  it('only ever names people who have NOT opened Netai', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await listWakeUpCandidates();

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    // A thread, a search or a subscription all mean they are already here.
    expect(sql).toContain('FROM threads t');
    expect(sql).toContain('FROM search_activity sa');
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM netai n WHERE n.id = usr.id)');
  });

  it('wakes only someone we can say something specific to', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await listWakeUpCandidates();

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    // Dormant alone is 62,121 of 62,164 accounts — the public role fact is
    // what makes the list a list, and the message writable.
    expect(sql).toContain('f.is_public AND f.retracted_at IS NULL');
    expect(params[1]).toEqual(['role', 'occupation', 'employer', 'expertise', 'headline']);
  });

  it('ranks by how much of their own network is already here', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await listWakeUpCandidates();

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ORDER BY contacts_on_netai DESC, phonebook DESC, c.id');
  });

  it('caps the limit — a bulk read of this is not a bulk send', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await listWakeUpCandidates(100_000);

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBe(500);
  });

  it('never returns fewer than one row of headroom for a silly limit', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await listWakeUpCandidates(0);

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBe(1);
  });
});
