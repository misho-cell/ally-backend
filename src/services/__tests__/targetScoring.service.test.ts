jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../unmetNeeds.service', () => ({
  __esModule: true,
  findUnmetNeeds: jest.fn(),
}));

import { query } from '../../db/postgres/client';
import { findUnmetNeeds } from '../unmetNeeds.service';
import { buildTargetList, countAskableUsers } from '../targetScoring.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockFindUnmetNeeds = findUnmetNeeds as jest.MockedFunction<typeof findUnmetNeeds>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

function routeScoreQueries(opts: {
  reach?: { phone: string; reach: string }[];
  strength?: { contact_phone: string; strength: number }[];
  colour?: { phone: string; status: string }[];
  facts?: { phone: string; cnt: string }[];
  askableCount?: number;
}): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('UNION')) return Promise.resolve(rows(opts.reach ?? []) as never);
    if (sql.includes('contact_relationship_scores'))
      return Promise.resolve(rows(opts.strength ?? []) as never);
    if (sql.includes('"relationshipStatus" AS status'))
      return Promise.resolve(rows(opts.colour ?? []) as never);
    if (sql.includes('FROM contact_facts')) return Promise.resolve(rows(opts.facts ?? []) as never);
    if (sql.includes('FROM "User" u'))
      return Promise.resolve(rows([{ count: String(opts.askableCount ?? 100) }]) as never);
    return Promise.resolve(rows([]) as never);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('buildTargetList', () => {
  it('returns nothing when there are no unmet needs', async () => {
    mockFindUnmetNeeds.mockResolvedValue([]);
    routeScoreQueries({});

    expect(await buildTargetList(30)).toEqual([]);
  });

  it('dedupes a candidate across topics, summing Pull and keeping the smallest matched pool', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      {
        query: 'ვეტერინარი',
        ask_count: 2,
        city: 'თბილისი',
        candidates: [
          { phone: '+995500000001', label: 'ვეტერინარი გია', source: 'alias' },
          { phone: '+995500000002', label: 'other vet', source: 'alias' },
        ],
      },
      {
        query: 'vet',
        ask_count: 1,
        city: null,
        candidates: [{ phone: '+995500000001', label: 'ვეტერინარი გია', source: 'alias' }],
      },
    ]);
    routeScoreQueries({ askableCount: 50 });

    const out = await buildTargetList(30);

    const target = out.find((e) => e.phone === '+995500000001');
    expect(target?.parts.pull).toBe(2);
    // Matched the second topic's single-candidate pool too — gap-filling.
    expect(target?.parts.gap_filling_trade).toBe(true);
    expect(target?.city).toBe('თბილისი');
  });

  it('flags needs-Netai signals from the matched label, explainably', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      {
        query: 'director',
        ask_count: 1,
        city: null,
        candidates: [{ phone: '+995500000003', label: 'Sales Director', source: 'tag' }],
      },
    ]);
    routeScoreQueries({ askableCount: 50 });

    const out = await buildTargetList(30);

    expect(out[0].parts.needs_netai_signs).toBe(true);
  });

  it('combines Reach and Warmth signals into the score parts', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      {
        query: 'ელექტრიკოსი',
        ask_count: 1,
        city: null,
        candidates: [{ phone: '+995500000004', label: 'electrician', source: 'tag' }],
      },
    ]);
    routeScoreQueries({
      reach: [{ phone: '+995500000004', reach: '3' }],
      strength: [{ contact_phone: '+995500000004', strength: 0.8 }],
      colour: [{ phone: '+995500000004', status: 'allies' }],
      facts: [{ phone: '+995500000004', cnt: '2' }],
      askableCount: 50,
    });

    const out = await buildTargetList(30);

    expect(out[0].parts.reach).toBe(3);
    // warmth = min(1, 0.8*0.5 + 0.3 (allies) + min(0.2, 2*0.05)) = 0.8
    expect(out[0].parts.warmth).toBeCloseTo(0.8, 5);
  });

  it("caps the list length at the network's current ask capacity", async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      {
        query: 'x',
        ask_count: 1,
        city: null,
        candidates: [
          { phone: '+995500000005', label: 'a', source: 'tag' },
          { phone: '+995500000006', label: 'b', source: 'tag' },
          { phone: '+995500000007', label: 'c', source: 'tag' },
        ],
      },
    ]);
    routeScoreQueries({ askableCount: 1 });

    const out = await buildTargetList(30);

    expect(out).toHaveLength(1);
  });

  it('ranks the highest score first', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      {
        query: 'x',
        ask_count: 1,
        city: null,
        candidates: [
          { phone: '+995500000008', label: 'plain label', source: 'tag' },
          { phone: '+995500000009', label: 'Director plain label', source: 'tag' },
        ],
      },
    ]);
    routeScoreQueries({ askableCount: 50 });

    const out = await buildTargetList(30);

    expect(out[0].phone).toBe('+995500000009');
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });
});

describe('countAskableUsers', () => {
  it('reads the aggregate count from the query result', async () => {
    routeScoreQueries({ askableCount: 21 });

    expect(await countAskableUsers()).toBe(21);
  });
});
