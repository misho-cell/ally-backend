jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { multiplierFor, outcomeLearning } from '../outcomeLearning.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.OUTCOME_LEARNING;
});

/**
 * Ticket 19 [43]. The founder asked for this built now, knowing — as I do —
 * that not one campaign has ever ended in a join. So the first thing it must do
 * is nothing: a learner that moves scores on a handful of outcomes is not
 * learning, it is following noise, and it would move real people up and down a
 * list he reads.
 */
describe('while there is nothing to learn from', () => {
  it('changes no score when no campaign has ever ended in a join', async () => {
    mockQuery.mockResolvedValue(
      rows([
        { tier: 'BEST', concluded: '30', joined: '0' },
        { tier: 'GOOD', concluded: '40', joined: '0' },
      ]) as never,
    );

    const learning = await outcomeLearning();

    expect(learning.tiers.every((t) => t.multiplier === 1)).toBe(true);
    expect(learning.verdict).toContain('No campaign has ended in a join');
  });

  it('holds a tier silent until it has enough concluded campaigns', async () => {
    mockQuery.mockResolvedValue(
      rows([
        { tier: 'BEST', concluded: '4', joined: '2' }, // a great rate on four answers
        { tier: 'GOOD', concluded: '4', joined: '0' },
      ]) as never,
    );

    const learning = await outcomeLearning();

    expect(multiplierFor(learning, 'BEST')).toBe(1);
    expect(learning.verdict).toContain('Not enough evidence');
  });
});

describe('once a cohort has answered', () => {
  it('lifts the tier that converts and lowers the one that does not', async () => {
    // 20 concluded each: BEST 4 joins (20%), GOOD 1 (5%). Overall 5/40 = 12.5%.
    mockQuery.mockResolvedValue(
      rows([
        { tier: 'BEST', concluded: '20', joined: '4' },
        { tier: 'GOOD', concluded: '20', joined: '1' },
      ]) as never,
    );

    const learning = await outcomeLearning();

    expect(multiplierFor(learning, 'BEST')).toBeGreaterThan(1);
    expect(multiplierFor(learning, 'GOOD')).toBeLessThan(1);
    expect(learning.verdict).toContain('5 joins');
  });

  it('never lets one cohort swamp everything the score already knows', async () => {
    mockQuery.mockResolvedValue(
      rows([
        { tier: 'BEST', concluded: '20', joined: '20' }, // a perfect, implausible run
        { tier: 'GOOD', concluded: '20', joined: '0' },
      ]) as never,
    );

    const learning = await outcomeLearning();

    expect(multiplierFor(learning, 'BEST')).toBeLessThanOrEqual(1.5);
    expect(multiplierFor(learning, 'GOOD')).toBeGreaterThanOrEqual(0.5);
  });

  it('reads the tier the engine committed to BEFORE the outcome was known', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await outcomeLearning();

    const sql = mockQuery.mock.calls[0][0] as string;
    // The FIRST listing, not today's — otherwise it marks its own homework
    // after seeing the answer.
    expect(sql).toContain('DISTINCT ON (h.phone)');
    expect(sql).toContain('ORDER BY h.phone, h.built_at ASC');
    // And an open campaign is unfinished, never a failure.
    expect(mockQuery.mock.calls[0][1]).toEqual([
      ['closed_joined', 'closed_declined_all', 'closed_exhausted', 'closed_stale_target'],
    ]);
  });
});

describe('the switch', () => {
  it('ignores outcomes entirely when it is off, without reading anything', async () => {
    process.env.OUTCOME_LEARNING = 'off';

    const learning = await outcomeLearning();

    expect(learning.tiers).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
