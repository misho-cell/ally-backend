jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../taskStore.service', () => ({ getTaskById: jest.fn() }));
jest.mock('../prematch.service', () => ({
  ...jest.requireActual('../prematch.service'),
  prematchMany: jest.fn(),
}));

import { query } from '../../db/postgres/client';
import { prematchMany, PrematchSource, PrematchWord } from '../prematch.service';
import { getTaskById } from '../taskStore.service';
import { goalWaveRanking, WaveRankingOutcome } from '../waveRanking.service';

/** The tester's 49931 (1691): the server's ranking, read without the model's plan choosing. */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockTask = getTaskById as jest.MockedFunction<typeof getTaskById>;
const mockWords = prematchMany as jest.MockedFunction<typeof prematchMany>;

const A = { name: 'ანა ტესტური', phone: '+447700900201', route: 'r' };
const C = { name: 'ცირა ტესტური', phone: '+447700900203', route: 'r' };
const F = { name: 'ფიქრია ტესტური', phone: '+447700900206', route: 'r' };
const TITLE = 'ელექტრიკოსი მჭირდება სახლში გაყვანილობის შესაკეთებლად';

function goal(people: readonly (typeof A)[]): Awaited<ReturnType<typeof getTaskById>> {
  return {
    user_id: '182405',
    title: TITLE,
    plan: { people_to_involve: people },
    plan_version: 1,
    plan_approved_at: null,
  } as unknown as Awaited<ReturnType<typeof getTaskById>>;
}

const stat = (
  phone: string,
  yes: number,
  asked: number,
): { phone: string; field: string; asked: number; yes: number; referred: number } => ({
  phone,
  field: 'elektrikosi saklsi gakvanilobis',
  asked,
  yes,
  referred: 0,
});

describe('the wave ranking read (1691)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists the plan in the server’s order, with the signals behind each place', async () => {
    mockTask.mockResolvedValue(goal([F, C, A]));
    mockWords.mockResolvedValue(
      new Map(
        [A, C, F].map((p) => [
          p.phone.replace(/\D/g, ''),
          { word: PrematchWord.Possibly, source: PrematchSource.NothingKnown },
        ]),
      ),
    );
    mockQuery.mockResolvedValueOnce({ rows: [{ found: true }] } as never).mockResolvedValueOnce({
      rows: [stat(A.phone, 9, 10), stat(C.phone, 5, 10), stat(F.phone, 0, 10)],
    } as never);
    const result = await goalWaveRanking(23926);
    expect(result.outcome).toBe(WaveRankingOutcome.Read);
    expect(result.ranking?.map((r) => [r.rank, r.name])).toEqual([
      [1, A.name],
      [2, C.name],
      [3, F.name],
    ]);
    expect(result.ranking?.[0].field_rate).toBeCloseTo(10 / 12);
    expect(result.ranking?.[0].prematch).toBe(PrematchWord.Possibly);
    expect(JSON.stringify(result)).not.toContain('447700');
  });

  it('reads no real owner’s plan', async () => {
    mockTask.mockResolvedValue(goal([A]));
    mockQuery.mockResolvedValueOnce({ rows: [{ found: false }] } as never);
    await expect(goalWaveRanking(23926)).resolves.toEqual({
      outcome: WaveRankingOutcome.NotATestSeat,
    });
    expect(mockWords).not.toHaveBeenCalled();
  });

  it('says so for a missing goal and for a goal with no people in its plan', async () => {
    mockTask.mockResolvedValueOnce(null);
    await expect(goalWaveRanking(1)).resolves.toEqual({ outcome: WaveRankingOutcome.NotFound });
    mockTask.mockResolvedValueOnce(goal([]));
    mockQuery.mockResolvedValueOnce({ rows: [{ found: true }] } as never);
    await expect(goalWaveRanking(2)).resolves.toEqual({ outcome: WaveRankingOutcome.NoPlan });
  });
});
