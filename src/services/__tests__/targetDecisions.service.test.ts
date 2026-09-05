jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import {
  applyTargetDecisions,
  listTargetDecisions,
  refusedTargetPhones,
} from '../targetDecisions.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockQuery.mockResolvedValue(rows([]) as never);
});

describe('the founder reads the list and answers', () => {
  it('takes yes and no in either language', async () => {
    const out = await applyTargetDecisions(
      [
        { phone: '+995500000001', decision: 'კი' },
        { phone: '+995500000002', decision: 'არა' },
        { phone: '+995500000003', decision: 'YES' },
        { phone: '+995500000004', decision: 'n' },
      ],
      '501',
    );

    expect(out).toEqual({ approved: 2, rejected: 2, skipped: 0, errors: [] });
  });

  // The failure this guards: a mis-read "maybe" landing as "no" deletes
  // somebody from every future list and nobody ever sees it happen.
  it('refuses to interpret anything that is neither — the row is left alone', async () => {
    const out = await applyTargetDecisions(
      [
        { phone: '+995500000005', decision: 'ალბათ' },
        { phone: '+995500000006', decision: 'maybe' },
        { phone: '+995500000007', decision: '' },
        { phone: '+995500000008' },
      ],
      '501',
    );

    expect(out.approved).toBe(0);
    expect(out.rejected).toBe(0);
    expect(out.skipped).toBe(4);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('a row with no phone is reported, not silently dropped', async () => {
    const out = await applyTargetDecisions([{ phone: '  ', decision: 'არა' }], '501');

    expect(out.skipped).toBe(1);
    expect(out.errors).toHaveLength(1);
  });

  it('a second thought replaces the first, and keeps the older note', async () => {
    await applyTargetDecisions([{ phone: '+995500000009', decision: 'კი' }], '501');

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ON CONFLICT (phone) DO UPDATE');
    expect(sql).toContain('note = COALESCE(EXCLUDED.note, target_decisions.note)');
  });

  it('records the reason when one is given — the only place a private one goes', async () => {
    await applyTargetDecisions(
      [{ phone: '+995500000010', decision: 'არა', note: 'ეს ჩემი მეუღლეა' }],
      '501',
    );

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBe('ეს ჩემი მეუღლეა');
    expect(params[3]).toBe('501');
  });

  it('refuses a paste bigger than any list will ever be, and writes nothing', async () => {
    const many = Array.from({ length: 501 }, (_, i) => ({
      phone: `+9955000${String(i).padStart(5, '0')}`,
      decision: 'no',
    }));

    const out = await applyTargetDecisions(many, '501');

    expect(out.errors).toHaveLength(1);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('reads back only the refusals for the gate', async () => {
    mockQuery.mockResolvedValue(rows([{ phone: '+995500000011' }]) as never);

    const refused = await refusedTargetPhones();

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("decision = 'no'");
    expect(refused.has('+995500000011')).toBe(true);
  });

  it('lists the standing answers with an ISO date', async () => {
    mockQuery.mockResolvedValue(
      rows([
        {
          phone: '+995500000012',
          decision: 'no',
          note: null,
          decided_by: '501',
          updated_at: '2026-09-05T10:00:00.000Z',
        },
      ]) as never,
    );

    const out = await listTargetDecisions();

    expect(out[0]?.updated_at).toBe('2026-09-05T10:00:00.000Z');
  });
});
