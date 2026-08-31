jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../unmetNeeds.service', () => ({
  __esModule: true,
  findUnmetNeeds: jest.fn(),
}));

import { query } from '../../db/postgres/client';
import { findUnmetNeeds, UnmetNeed } from '../unmetNeeds.service';
import { buildTargetList, clearTargetListCache, countAskableUsers } from '../targetScoring.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockFindUnmetNeeds = findUnmetNeeds as jest.MockedFunction<typeof findUnmetNeeds>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

function need(
  topic: string,
  candidates: { phone: string; label: string }[],
  city: string | null = null,
): UnmetNeed {
  return {
    query: topic,
    ask_count: 1,
    sources: { netai: 1, old_ally: 0 },
    city,
    candidates: candidates.map((c) => ({ ...c, source: 'tag' as const })),
  };
}

function routeScoreQueries(opts: {
  reach?: { phone: string; reach: string }[];
  strength?: { contact_phone: string; strength: number }[];
  colour?: { phone: string; status: string }[];
  facts?: { phone: string; cnt: string }[];
  aliases?: { phone: string; contactId: number; alias: string }[];
  askableCount?: number;
  // Ticket 7 task 15: the two once-"unbuildable" criteria.
  goalRelevantPhones?: string[];
  bestUserIds?: number[];
  bestUserPhones?: string[];
  bestUserFactValues?: string[];
  /** phone -> subscribed holders; unlisted phones default to 2 (gate-passable). */
  subscribedHolders?: Record<string, number>;
  /** The founder's gate-passable pool source (default empty). */
  poolPeople?: { phone: string; label: string }[];
}): void {
  mockQuery.mockImplementation((sql: string, params?: unknown[]) => {
    if (sql.includes('mode() WITHIN GROUP'))
      return Promise.resolve(rows(opts.poolPeople ?? []) as never);
    if (sql.includes('AS holders')) {
      // Every asked phone passes the gate by default (holders=2), so the
      // pre-existing scoring tests keep testing scoring, not the new hard
      // filter; a test of the filter itself overrides via subscribedHolders.
      const asked = Array.isArray(params?.[0]) ? (params?.[0] as string[]) : [];
      return Promise.resolve(
        rows(
          asked.map((phone) => ({
            phone,
            holders: String(opts.subscribedHolders?.[phone] ?? 2),
          })),
        ) as never,
      );
    }
    if (sql.includes('CROSS JOIN LATERAL'))
      return Promise.resolve(rows(opts.aliases ?? []) as never);
    if (sql.includes('FROM tasks t'))
      return Promise.resolve(
        rows((opts.goalRelevantPhones ?? []).map((phone) => ({ phone }))) as never,
      );
    if (sql.includes('SELECT u.id FROM "User" u'))
      return Promise.resolve(rows((opts.bestUserIds ?? []).map((id) => ({ id }))) as never);
    if (sql.includes('FROM "UserPhone"'))
      return Promise.resolve(
        rows((opts.bestUserPhones ?? []).map((phone) => ({ phone }))) as never,
      );
    if (sql.includes('field_type = ANY'))
      return Promise.resolve(
        rows((opts.bestUserFactValues ?? []).map((value) => ({ value }))) as never,
      );
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
  // The weekly-list cache is module-level; without this every test after the
  // first would read the first test's built list.
  clearTargetListCache();
});

describe('buildTargetList', () => {
  it('returns nothing when there are no unmet needs', async () => {
    mockFindUnmetNeeds.mockResolvedValue([]);
    routeScoreQueries({});

    expect(await buildTargetList(30)).toEqual([]);
  });

  it('dedupes a candidate across topics, summing Pull and keeping the smallest matched pool', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need(
        'ვეტერინარი',
        [
          { phone: '+995500000001', label: 'ვეტერინარი გია' },
          { phone: '+995500000002', label: 'other vet' },
        ],
        'თბილისი',
      ),
      need('vet', [{ phone: '+995500000001', label: 'ვეტერინარი გია' }]),
    ]);
    routeScoreQueries({ askableCount: 50 });

    const out = await buildTargetList(30);

    const target = out.find((e) => e.phone === '+995500000001');
    expect(target?.parts.pull).toBe(2);
    // Matched the second topic's single-candidate pool too — gap-filling.
    expect(target?.parts.gap_filling_trade).toBe(true);
    expect(target?.city).toBe('თბილისი');
  });

  it("founder's pool (31 Aug): a gate-passable person nobody searched for still makes the list", async () => {
    mockFindUnmetNeeds.mockResolvedValue([]);
    routeScoreQueries({ askableCount: 50, poolPeople: [{ phone: '+995500000031', label: 'ეკა' }] });

    const out = await buildTargetList(30);

    const pooled = out.find((e) => e.phone === '+995500000031');
    expect(pooled).toBeDefined();
    expect(pooled?.parts.pull).toBe(0);
    expect(pooled?.parts.gap_filling_trade).toBe(false);
  });

  it("founder's target rule (31 Aug): only gate-passable people — held by 2+ subscribers", async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('ბუღალტერი', [
        { phone: '+995500000021', label: 'ნათია ბუღალტერი' },
        { phone: '+995500000022', label: 'გია ბუღალტერი' },
      ]),
    ]);
    routeScoreQueries({
      askableCount: 50,
      subscribedHolders: { '+995500000021': 2, '+995500000022': 1 },
    });

    const out = await buildTargetList(30);

    // Held by 2 subscribers: on the list, with the count in parts.
    const kept = out.find((e) => e.phone === '+995500000021');
    expect(kept?.parts.subscribed_holders).toBe(2);
    // Held by 1: the door would refuse them — never invited.
    expect(out.find((e) => e.phone === '+995500000022')).toBeUndefined();
  });

  it('task 15: flags goal_relevant when an OPEN goal whole-word-matches the label, and scores it higher', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('სანტექნიკოსი', [
        { phone: '+995500000011', label: 'ზურა სანტექნიკოსი' },
        { phone: '+995500000012', label: 'გია სანტექნიკოსი' },
      ]),
    ]);
    routeScoreQueries({ askableCount: 50, goalRelevantPhones: ['+995500000011'] });

    const out = await buildTargetList(30);

    const relevant = out.find((e) => e.phone === '+995500000011');
    const other = out.find((e) => e.phone === '+995500000012');
    expect(relevant?.parts.goal_relevant).toBe(true);
    expect(other?.parts.goal_relevant).toBe(false);
    expect((relevant?.score ?? 0) > (other?.score ?? 0)).toBe(true);
  });

  it("task 15: flags best_user_lookalike from a whole-token match against best users' trade facts — never name tokens", async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('იურისტი', [
        { phone: '+995500000013', label: 'დათო იურისტი' },
        { phone: '+995500000014', label: 'გია მშენებელი' },
      ]),
    ]);
    routeScoreQueries({
      askableCount: 50,
      bestUserIds: [7],
      bestUserPhones: ['+995599123456'],
      bestUserFactValues: ['იურისტი კორპორატიულ საქმეებში'],
    });

    const out = await buildTargetList(30);

    expect(out.find((e) => e.phone === '+995500000013')?.parts.best_user_lookalike).toBe(true);
    expect(out.find((e) => e.phone === '+995500000014')?.parts.best_user_lookalike).toBe(false);
  });

  it('task 15: with NO best users, the lookalike flag is false everywhere and no fact query runs', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('იურისტი', [{ phone: '+995500000015', label: 'დათო იურისტი' }]),
    ]);
    routeScoreQueries({ askableCount: 50, bestUserIds: [] });

    const out = await buildTargetList(30);

    expect(out[0].parts.best_user_lookalike).toBe(false);
    // The best-users PHONE lookup must be skipped (the pool source's own SQL
    // also mentions UserPhone in a NOT EXISTS — that one is not this).
    const phoneQuery = mockQuery.mock.calls.find(
      ([sql]) =>
        (sql as string).includes('FROM "UserPhone"') &&
        !(sql as string).includes('mode() WITHIN GROUP'),
    );
    expect(phoneQuery).toBeUndefined();
  });

  it('flags needs-Netai signals from the matched label, explainably', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('director', [{ phone: '+995500000003', label: 'Sales Director' }]),
    ]);
    routeScoreQueries({ askableCount: 50 });

    const out = await buildTargetList(30);

    expect(out[0].parts.needs_netai_signs).toBe(true);
  });

  it('combines Reach and Warmth signals into the score parts', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('ელექტრიკოსი', [{ phone: '+995500000004', label: 'electrician' }]),
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
      need('x', [
        { phone: '+995500000005', label: 'a' },
        { phone: '+995500000006', label: 'b' },
        { phone: '+995500000007', label: 'c' },
      ]),
    ]);
    routeScoreQueries({ askableCount: 1 });

    const out = await buildTargetList(30);

    expect(out).toHaveLength(1);
  });

  it('ranks the highest score first', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [
        { phone: '+995500000008', label: 'plain label' },
        { phone: '+995500000009', label: 'Director plain label' },
      ]),
    ]);
    routeScoreQueries({ askableCount: 50 });

    const out = await buildTargetList(30);

    expect(out[0].phone).toBe('+995500000009');
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });

  // ─── Ticket 7 Task 4 item 1: a target must be a person ────────────────────

  it('HARD-EXCLUDES anything that is not a Georgian personal mobile — 0-800 lines, short codes, foreign prefixes', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [
        { phone: '+995800100100', label: '0800 hotline' }, // 0-800 line
        { phone: '+15551234567', label: 'foreign' }, // foreign prefix
        { phone: '+99532123456', label: 'landline' }, // not a 5xx mobile
        { phone: '+995500000010', label: 'real person' },
      ]),
    ]);
    routeScoreQueries({ askableCount: 50 });

    const out = await buildTargetList(30);

    expect(out.map((e) => e.phone)).toEqual(['+995500000010']);
  });

  it('HARD-EXCLUDES a hotline: a brand stoplist word dominating the aliases at reach > 100 (the wissol/maksima evidence)', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [
        { phone: '+995500000011', label: 'wissol' },
        { phone: '+995500000012', label: 'დათო ვეტერინარი' },
      ]),
    ]);
    routeScoreQueries({
      reach: [
        { phone: '+995500000011', reach: '644' },
        { phone: '+995500000012', reach: '143' },
      ],
      aliases: [
        { phone: '+995500000011', contactId: 1, alias: 'wissol' },
        { phone: '+995500000011', contactId: 2, alias: 'wissol hotline' },
        { phone: '+995500000011', contactId: 3, alias: 'wissol 24/7' },
        // The popular vet: high reach but his top token is his name/trade,
        // not a brand — he is a person and stays.
        { phone: '+995500000012', contactId: 4, alias: 'დათო ვეტერინარი' },
        { phone: '+995500000012', contactId: 5, alias: 'დათო ვეტი' },
      ],
      askableCount: 50,
    });

    const out = await buildTargetList(30);

    expect(out.map((e) => e.phone)).toEqual(['+995500000012']);
    expect(out[0].parts.person_confirmed).toBe(true);
  });

  it('person_confirmed requires ≥2 DISTINCT contributors sharing a non-brand token — and unconfirmed entries rank last', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [
        { phone: '+995500000013', label: 'confirmed person' },
        { phone: '+995500000014', label: 'lone save, higher score' },
      ]),
    ]);
    routeScoreQueries({
      // The unconfirmed one has far higher reach — a raw score sort would put
      // it first; person_confirmed must outrank score.
      reach: [
        { phone: '+995500000013', reach: '2' },
        { phone: '+995500000014', reach: '90' },
      ],
      aliases: [
        { phone: '+995500000013', contactId: 1, alias: 'gia melashvili' },
        { phone: '+995500000013', contactId: 2, alias: 'gia gldani' },
        { phone: '+995500000014', contactId: 3, alias: 'someone once' },
      ],
      askableCount: 50,
    });

    const out = await buildTargetList(30);

    expect(out.map((e) => e.parts.person_confirmed)).toEqual([true, false]);
    expect(out[0].phone).toBe('+995500000013');
  });

  it('is deterministic: equal scores break by phone, so two reads return the same order', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [
        { phone: '+995500000017', label: 'same' },
        { phone: '+995500000015', label: 'same' },
        { phone: '+995500000016', label: 'same' },
      ]),
    ]);
    routeScoreQueries({ askableCount: 50 });

    const first = await buildTargetList(30);
    const second = await buildTargetList(30);

    expect(first.map((e) => e.phone)).toEqual(['+995500000015', '+995500000016', '+995500000017']);
    expect(second.map((e) => e.phone)).toEqual(first.map((e) => e.phone));
  });
});

describe('countAskableUsers', () => {
  it('reads the aggregate count from the query result', async () => {
    routeScoreQueries({ askableCount: 21 });

    expect(await countAskableUsers()).toBe(21);
  });
});
