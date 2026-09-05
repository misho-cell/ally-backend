jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../unmetNeeds.service', () => ({
  __esModule: true,
  findUnmetNeeds: jest.fn(),
}));

import { query } from '../../db/postgres/client';
import { findUnmetNeeds, UnmetNeed } from '../unmetNeeds.service';
import {
  buildTargetList,
  buildTargetListWithGates,
  clearTargetListCache,
  countAskableUsers,
  TARGET_GATES,
} from '../targetScoring.service';

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
  // Rule 14 (founder D102): the public facts that decide fit, and the warm
  // Netai user who could carry the invitation.
  fitFacts?: { phone: string; values: string[] }[];
  inviters?: { phone: string; user_id: number; colour: string | null; strength: number | null }[];
  // Rule 2's gates: the account behind a candidate phone, when there is one.
  accounts?: { phone: string; subscription_status: string | null; own_contacts: string }[];
}): void {
  mockQuery.mockImplementation((sql: string, params?: unknown[]) => {
    // Rule 14's queries are matched FIRST: they mention strings the older
    // branches below also match on.
    if (sql.includes('SELECT u.id FROM "User" u') && sql.includes('FROM threads t'))
      return Promise.resolve(rows([{ id: 501 }, { id: 502 }, { id: 1326 }]) as never);
    // The best-users set: same table, different question (task 23 excludes our
    // own people from it, so it now reads UserPhone as well).
    if (sql.includes('SELECT u.id FROM "User" u') && sql.includes("subscription_status = 'active'"))
      return Promise.resolve(rows((opts.bestUserIds ?? []).map((id) => ({ id }))) as never);
    if (sql.includes('uc."relationshipStatus"::text AS colour'))
      return Promise.resolve(rows((opts.inviters ?? []).filter((i) => i.colour !== null)) as never);
    if (sql.includes('FROM contact_relationship_scores'))
      return Promise.resolve(
        rows(
          (opts.inviters ?? [])
            .filter((i) => i.colour === null)
            .map((i) => ({ phone: i.phone, user_id: i.user_id, strength: i.strength })),
        ) as never,
      );
    if (sql.includes('array_agg(DISTINCT field_type'))
      return Promise.resolve(rows(opts.fitFacts ?? []) as never);
    if (sql.includes('AS own_contacts')) return Promise.resolve(rows(opts.accounts ?? []) as never);
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
    if (sql.includes('CROSS JOIN LATERAL')) {
      if (opts.aliases) return Promise.resolve(rows(opts.aliases) as never);
      // Default: every candidate is a person two people agree on by first name
      // AND surname — the shape task 23's gate requires. A test that cares
      // about the alias evidence passes its own `aliases` and overrides this.
      const asked = Array.isArray(params?.[0]) ? (params?.[0] as string[]) : [];
      return Promise.resolve(
        rows(
          asked.flatMap((phone) => [
            { phone, contactId: 901, alias: 'ნინო კახიძე' },
            { phone, contactId: 902, alias: 'ნინო კახიძე' },
          ]),
        ) as never,
      );
    }
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

  it('serves the hourly cache on a second read, and rebuilds when asked to refresh', async () => {
    mockFindUnmetNeeds.mockResolvedValue([]);
    routeScoreQueries({ askableCount: 50, poolPeople: [{ phone: '+995500000041', label: 'ეკა' }] });

    await buildTargetList(30);
    const afterFirst = mockFindUnmetNeeds.mock.calls.length;

    await buildTargetList(30);
    expect(mockFindUnmetNeeds.mock.calls.length).toBe(afterFirst);

    // The founder's post-import read: the facts that decide `fit` changed, so
    // the cached answer is the wrong one to serve.
    await buildTargetList(30, { refresh: true });
    expect(mockFindUnmetNeeds.mock.calls.length).toBe(afterFirst + 1);
  });

  it('dedupes a candidate across topics, summing Pull and keeping the smallest matched pool', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need(
        'ვეტერინარი',
        [
          { phone: '+995500000001', label: 'გია დირექტორი' },
          { phone: '+995500000002', label: 'other manager' },
        ],
        'თბილისი',
      ),
      need('vet', [{ phone: '+995500000001', label: 'გია დირექტორი' }]),
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
      need('კონსულტანტი', [
        { phone: '+995500000011', label: 'ზურა კონსულტანტი' },
        { phone: '+995500000012', label: 'გია კონსულტანტი' },
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
        !(sql as string).includes('mode() WITHIN GROUP') &&
        // Rule 2's account lookup reads UserPhone too, and so does the
        // best-users set's own exclusion of our people; neither is this.
        !(sql as string).includes('AS own_contacts') &&
        !(sql as string).includes("subscription_status = 'active'"),
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

  it('carries Reach in the parts', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('კონსულტანტი', [{ phone: '+995500000004', label: 'Nino consultant' }]),
    ]);
    routeScoreQueries({
      reach: [{ phone: '+995500000004', reach: '3' }],
      askableCount: 50,
    });

    const out = await buildTargetList(30);

    expect(out[0].parts.reach).toBe(3);
  });

  // ─── Rule 14 (founder D102, 3 September 2026) ──────────────────────────────
  // "chorus works two direction ways — right targets and right inviters who have
  // good/warm relations with targets". Fit picks the target, warmth picks the
  // inviter, and the two never mix.

  it('reads fit from the PUBLIC facts first, and an ownership word makes it strong', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('კონსალტინგი', [{ phone: '+995500000030', label: 'Irakli' }]),
    ]);
    routeScoreQueries({
      reach: [{ phone: '+995500000030', reach: '10' }],
      fitFacts: [
        {
          phone: '+995500000030',
          values: ['role: Co-Founder & CEO, IBCCS TAX Georgia', 'industry: tax advisory'],
        },
      ],
      askableCount: 50,
    });

    const out = await buildTargetList(30);

    expect(out[0].parts.fit).toBe('strong');
    expect(out[0].parts.fit_source).toBe('facts');
    expect(out[0].parts.fit_evidence).toContain('role: Co-Founder & CEO, IBCCS TAX Georgia');
  });

  it('falls back to the label words, then to NOT YET — which parks, never rejects', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [
        { phone: '+995500000031', label: 'Nino Sales Manager' },
        { phone: '+995500000032', label: 'Gia' },
      ]),
    ]);
    routeScoreQueries({ reach: [{ phone: '+995500000032', reach: '50' }], askableCount: 50 });

    const out = await buildTargetList(30);
    const byPhone = new Map(out.map((e) => [e.phone, e]));

    expect(byPhone.get('+995500000031')?.parts.fit).toBe('weak');
    expect(byPhone.get('+995500000031')?.parts.fit_source).toBe('label');
    // Nothing findable is NOT YET: still on the list, ranked last (Rule 6).
    expect(byPhone.get('+995500000032')?.parts.fit).toBe('not_yet');
    expect(byPhone.get('+995500000032')).toBeDefined();
  });

  it('warmth is NOT in the target score — a warm nobody ranks below a fitting stranger', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [
        { phone: '+995500000033', label: 'warm friend' },
        { phone: '+995500000034', label: 'stranger' },
      ]),
    ]);
    routeScoreQueries({
      reach: [
        { phone: '+995500000033', reach: '10' },
        { phone: '+995500000034', reach: '10' },
      ],
      // The warm one is the founder's closest tie; the other he barely knows.
      inviters: [{ phone: '+995500000033', user_id: 501, colour: 'allies', strength: null }],
      fitFacts: [{ phone: '+995500000034', values: ['role: Founder @ DataMind'] }],
      askableCount: 50,
    });

    const out = await buildTargetList(30);

    expect(out[0].phone).toBe('+995500000034');
    expect(out[0].parts.fit).toBe('strong');
  });

  it('names the inviter separately and routes a target with no warm inviter to direct outreach', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [
        { phone: '+995500000035', label: 'has a bridge' },
        { phone: '+995500000036', label: 'has none' },
      ]),
    ]);
    routeScoreQueries({
      reach: [
        { phone: '+995500000035', reach: '5' },
        { phone: '+995500000036', reach: '5' },
      ],
      inviters: [
        { phone: '+995500000035', user_id: 501, colour: 'contacts', strength: null },
        { phone: '+995500000035', user_id: 502, colour: 'allies', strength: null },
      ],
      askableCount: 50,
    });

    const out = await buildTargetList(30);
    const byPhone = new Map(out.map((e) => [e.phone, e]));

    // The warmest of the two candidate inviters wins, and is named.
    expect(byPhone.get('+995500000035')?.inviter).toEqual({
      user_id: 502,
      warmth: 0.3,
      colour: 'allies',
    });
    expect(byPhone.get('+995500000035')?.route).toBe('chorus');
    expect(byPhone.get('+995500000036')?.inviter).toBeNull();
    expect(byPhone.get('+995500000036')?.route).toBe('direct');
  });

  it('only a NETAI user can be an inviter — the ids are resolved first, then passed in', async () => {
    mockFindUnmetNeeds.mockResolvedValue([need('x', [{ phone: '+995500000037', label: 'a' }])]);
    routeScoreQueries({ askableCount: 50 });

    await buildTargetList(30);

    // Who counts as a Netai user: a thread, a search, or a subscription.
    const whoQuery = mockQuery.mock.calls.find(
      ([sql]) =>
        (sql as string).includes('SELECT u.id FROM "User" u') &&
        (sql as string).includes('FROM threads t'),
    );
    expect(whoQuery?.[0]).toContain('FROM search_activity sa');

    // And the two lookups are driven from the PHONES, with those ids as a
    // list — the subquery version walked every connection of every Netai user
    // and timed the route out live.
    const colourQuery = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('uc."relationshipStatus"::text AS colour'),
    ) as [string, unknown[]];
    expect(colourQuery[0]).toContain('ucp.phone = ANY($1)');
    expect(colourQuery[0]).toContain('uc."originUserId" = ANY($2::int[])');
    expect(colourQuery[1][1]).toEqual([501, 502, 1326]);
  });

  // ─── Rule 2's exclusion pass, and the file's own negative test ─────────────
  // The founder's seed-phase ruling (5 September): with 22 subscribers, "two
  // holders must already be paying" passed 1 of 42 researched businessmen.
  describe('who counts as social proof', () => {
    afterEach(() => {
      delete process.env.TARGET_SOCIAL_PROOF;
    });

    it('asks for subscribers by default, and says so', async () => {
      mockFindUnmetNeeds.mockResolvedValue([]);
      routeScoreQueries({ askableCount: 50 });

      const build = await buildTargetListWithGates(30);

      expect(build.social_proof_basis).toBe('subscribers');
      const poolQuery = mockQuery.mock.calls.find(([sql]) =>
        (sql as string).includes('mode() WITHIN GROUP'),
      ) as [string, unknown[]];
      expect(poolQuery[0]).toContain('u.subscription_status = ANY($1)');
    });

    it('under netai_users both holder queries read the SAME id list', async () => {
      process.env.TARGET_SOCIAL_PROOF = 'netai_users';
      mockFindUnmetNeeds.mockResolvedValue([need('x', [{ phone: '+995500000060', label: 'გია' }])]);
      routeScoreQueries({ askableCount: 50 });

      const build = await buildTargetListWithGates(30);

      expect(build.social_proof_basis).toBe('netai_users');
      const poolQuery = mockQuery.mock.calls.find(([sql]) =>
        (sql as string).includes('mode() WITHIN GROUP'),
      ) as [string, unknown[]];
      const holdersQuery = mockQuery.mock.calls.find(([sql]) =>
        (sql as string).includes('AS holders'),
      ) as [string, unknown[]];
      expect(poolQuery[0]).toContain('u.id = ANY($1::int[])');
      expect(holdersQuery[0]).toContain('u.id = ANY($2::int[])');
      // A candidate that entered the pool must not then fail the very gate
      // that admitted them — same list, both places.
      expect(poolQuery[1][0]).toEqual([501, 502, 1326]);
      expect(holdersQuery[1][1]).toEqual([501, 502, 1326]);
    });

    it('the threshold itself does not move — only who may meet it', async () => {
      process.env.TARGET_SOCIAL_PROOF = 'netai_users';
      mockFindUnmetNeeds.mockResolvedValue([]);
      routeScoreQueries({ askableCount: 50 });

      const build = await buildTargetListWithGates(30);

      expect(build.social_proof_min_holders).toBe(2);
    });
  });

  // The founder's own ask: an exclusion rule you cannot count is a rule you
  // cannot argue with. Every gate reports what it caught and what it removed.
  describe('the gate ledger', () => {
    const CROWD = [
      { phone: '+995500000042', reach: '644' },
      { phone: '+995500000044', reach: '9' },
    ];
    const ALIASES = [
      { phone: '+995500000042', contactId: 1, alias: 'wissol' },
      { phone: '+995500000042', contactId: 2, alias: 'wissol hotline' },
      { phone: '+995500000044', contactId: 3, alias: 'Nika Khazaradze Director' },
      { phone: '+995500000044', contactId: 4, alias: 'Nika Khazaradze' },
    ];

    function mixedSet(): void {
      mockFindUnmetNeeds.mockResolvedValue([
        need('x', [
          { phone: '+995500000042', label: 'wissol' },
          { phone: '+995500000043', label: 'ზურა სანტექნიკოსი' },
          { phone: '+995500000044', label: 'Nika Khazaradze Director' },
          { phone: '0800100100', label: 'ცხელი ხაზი' },
        ]),
      ]);
      routeScoreQueries({ reach: CROWD, aliases: ALIASES, askableCount: 50 });
    }

    it('names every gate, and counts the ones that fired', async () => {
      mixedSet();

      const build = await buildTargetListWithGates(30);

      expect(build.gates.map((g) => g.gate)).toEqual([...TARGET_GATES]);
      expect(build.candidates_in).toBe(4);
      const fired = new Map(
        build.gates.filter((g) => g.removed > 0).map((g) => [g.gate, g.removed]),
      );
      expect(fired.get('not_a_plausible_mobile')).toBe(1);
      expect(fired.get('hotline')).toBe(1);
      expect(build.entries.map((e) => e.phone)).toEqual(['+995500000044']);
      expect(build.survived).toBe(1);
    });

    it('every gate is enabled by default and removes what it matches', async () => {
      mixedSet();

      const build = await buildTargetListWithGates(30);

      for (const gate of build.gates) {
        expect(gate.enabled).toBe(true);
        expect(gate.removed).toBe(gate.matched);
      }
    });

    it('a gate named in TARGET_GATES_OFF still counts, but stops removing', async () => {
      process.env.TARGET_GATES_OFF = 'hotline';
      try {
        mixedSet();

        const build = await buildTargetListWithGates(30);

        const hotline = build.gates.find((g) => g.gate === 'hotline');
        expect(hotline).toEqual({ gate: 'hotline', enabled: false, removed: 0, matched: 1 });
        // The line walks on to the next gate instead of vanishing here — the
        // ledger shows exactly which rule is really keeping it out. „wissol"
        // and „wissol hotline" name nobody, so the person check takes it.
        expect(build.gates.find((g) => g.gate === 'not_a_person')?.removed).toBe(1);
        expect(build.entries.map((e) => e.phone)).toEqual(['+995500000044']);
      } finally {
        delete process.env.TARGET_GATES_OFF;
      }
    });
  });

  it("the file's negative test: a violin teacher, a calligrapher and a petrol line cannot reach the list at all", async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [
        { phone: '+995500000040', label: 'violino maswavlebeli' },
        { phone: '+995500000041', label: 'calligraphy Nino' },
        { phone: '+995500000042', label: 'wissol' },
        { phone: '+995500000043', label: 'ზურა სანტექნიკოსი' },
        { phone: '+995500000044', label: 'Nika Khazaradze Director' },
      ]),
    ]);
    routeScoreQueries({
      reach: [{ phone: '+995500000042', reach: '644' }],
      aliases: [
        { phone: '+995500000042', contactId: 1, alias: 'wissol' },
        { phone: '+995500000042', contactId: 2, alias: 'wissol hotline' },
        // The one real person in the set, named by two people.
        { phone: '+995500000044', contactId: 3, alias: 'Nika Khazaradze Director' },
        { phone: '+995500000044', contactId: 4, alias: 'Nika Khazaradze' },
      ],
      askableCount: 50,
    });

    const out = await buildTargetList(30);

    // Absent, not ranked low: an excluded person is not on the list.
    expect(out.map((e) => e.phone)).toEqual(['+995500000044']);
  });

  it('a trade with something else survives — Rule 5: ownership ranks, it does not gate', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [
        { phone: '+995500000045', label: 'ზურა სანტექნიკოსი' },
        { phone: '+995500000046', label: 'ლევან სანტექნიკოსი' },
      ]),
    ]);
    routeScoreQueries({
      // The second plumber owns the firm, and the facts say so.
      fitFacts: [
        { phone: '+995500000046', values: ['role: Founder @ AquaService', 'industry: plumbing'] },
      ],
      askableCount: 50,
    });

    const out = await buildTargetList(30);

    expect(out.map((e) => e.phone)).toEqual(['+995500000046']);
  });

  it('excludes an existing paying user — there is nothing to sell them', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [
        { phone: '+995500000047', label: 'Nino Director' },
        { phone: '+995500000048', label: 'Gia Director' },
      ]),
    ]);
    routeScoreQueries({
      accounts: [
        { phone: '+995500000047', subscription_status: 'active', own_contacts: '200' },
        { phone: '+995500000048', subscription_status: null, own_contacts: '200' },
      ],
      askableCount: 50,
    });

    const out = await buildTargetList(30);

    expect(out.map((e) => e.phone)).toEqual(['+995500000048']);
  });

  it('excludes a phonebook under 200 — the founder\'s "very young and possibly not working" rule', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [
        { phone: '+995500000049', label: 'Nino Director' },
        { phone: '+995500000050', label: 'Gia Director' },
      ]),
    ]);
    routeScoreQueries({
      accounts: [
        // own_contacts is counted with a LIMIT at the threshold, so 200 means
        // "at least 200" and anything below it is the real number.
        { phone: '+995500000049', subscription_status: null, own_contacts: '12' },
        { phone: '+995500000050', subscription_status: null, own_contacts: '200' },
      ],
      askableCount: 50,
    });

    const out = await buildTargetList(30);

    expect(out.map((e) => e.phone)).toEqual(['+995500000050']);
  });

  it('a phone with no account at all keeps both account gates inapplicable', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [{ phone: '+995500000051', label: 'Nino Director' }]),
    ]);
    routeScoreQueries({ accounts: [], askableCount: 50 });

    const out = await buildTargetList(30);

    expect(out.map((e) => e.phone)).toEqual(['+995500000051']);
  });

  it('Rule 14 (c): when the label names a company but the phonebooks name a person, the row carries the person', async () => {
    // The real row, live on 3 September: 28 phonebooks hold Nika Kutsia, and
    // ten of them — the same fixture accounts that carry the „Dato Q7" string
    // — saved him as „Maxin.ai Ceo", which is what the list was displaying.
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [{ phone: '+995500000058', label: 'Maxin.ai Ceo' }]),
    ]);
    routeScoreQueries({
      aliases: [
        { phone: '+995500000058', contactId: 1, alias: 'Maxin.ai Ceo' },
        { phone: '+995500000058', contactId: 2, alias: 'Maxin.ai Ceo' },
        { phone: '+995500000058', contactId: 3, alias: 'Maxin.ai Ceo' },
        { phone: '+995500000058', contactId: 4, alias: 'Nika Kutsia' },
        { phone: '+995500000058', contactId: 5, alias: 'Nika Kutsia' },
      ],
      askableCount: 50,
    });

    const out = await buildTargetList(30);

    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('Nika Kutsia');
  });

  it('Rule 14 (c): a role word is not a name — two people typing "ceo" confirms nothing', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [{ phone: '+995500000057', label: 'Maxin.ai Ceo' }]),
    ]);
    routeScoreQueries({
      aliases: [
        { phone: '+995500000057', contactId: 1, alias: 'Maxin.ai Ceo' },
        { phone: '+995500000057', contactId: 2, alias: 'Maxin.ai Ceo' },
      ],
      askableCount: 50,
    });

    const out = await buildTargetList(30);

    expect(out).toEqual([]);
  });

  it('Rule 14 (c): a company label is not a target until a person is confirmed behind it', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [
        { phone: '+995500000052', label: 'Maxin.ai Ceo' },
        { phone: '+995500000053', label: 'Lika Chxirodze Maxin.ai' },
      ]),
    ]);
    routeScoreQueries({
      aliases: [
        // Two contributors agree on a real name behind the second number.
        { phone: '+995500000053', contactId: 1, alias: 'Lika Chxirodze Maxin.ai' },
        { phone: '+995500000053', contactId: 2, alias: 'Lika Chxirodze' },
      ],
      askableCount: 50,
    });

    const out = await buildTargetList(30);

    expect(out.map((e) => e.phone)).toEqual(['+995500000053']);
  });

  it('excludes our own people by the REVIEW_PHONE list auth already owns', async () => {
    const previous = process.env.REVIEW_PHONE;
    process.env.REVIEW_PHONE = '+995500000054, +995500000055';
    try {
      mockFindUnmetNeeds.mockResolvedValue([
        need('x', [
          { phone: '+995500000054', label: 'Lika Test' },
          { phone: '+995500000056', label: 'Nino Director' },
        ]),
      ]);
      routeScoreQueries({ askableCount: 50 });

      const out = await buildTargetList(30);

      expect(out.map((e) => e.phone)).toEqual(['+995500000056']);
    } finally {
      process.env.REVIEW_PHONE = previous;
    }
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
        { phone: '+995500000012', label: 'დათო ხაზარაძე დირექტორი' },
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
        // High reach, but his top token is his own name — he is a person and
        // stays. (The popular vet who used to stand here is now excluded by
        // G1 instead; see the trade-gate test below.)
        { phone: '+995500000012', contactId: 4, alias: 'დათო ხაზარაძე დირექტორი' },
        { phone: '+995500000012', contactId: 5, alias: 'დათო ხაზარაძე' },
        { phone: '+995500000012', contactId: 6, alias: 'დათო ხაზარაძე' },
      ],
      askableCount: 50,
    });

    const out = await buildTargetList(30);

    expect(out.map((e) => e.phone)).toEqual(['+995500000012']);
    expect(out[0].parts.person_confirmed).toBe(true);
  });

  it('an unconfirmed person is EXCLUDED, not ranked last (task 23: a check, not a flag)', async () => {
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

    // The lone save had far higher reach; before task 23 it merely ranked
    // last. Nobody the crowd cannot name is a target at all now.
    expect(out.map((e) => e.phone)).toEqual(['+995500000013']);
    expect(out[0].parts.person_confirmed).toBe(true);
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

// ─── Task 23: what must never reach the list ───────────────────────────────
// Every one of these passed `person_confirmed: true` on 2 September.

describe('task 23: an organisation, a bare first name and a relationship word are not people', () => {
  it.each([
    ['ახალგაზრდული ასოციაცია', 'an organisation'],
    ['Kato', 'a first name with no surname'],
    ['Tornike Mezobeli', 'Tornike the NEIGHBOUR — the second word is a relationship'],
    ['ბათუმი ორბი 2', 'a building, named after a city'],
  ])('%s is excluded (%s)', async (label) => {
    mockFindUnmetNeeds.mockResolvedValue([need('x', [{ phone: '+995500000060', label }])]);
    routeScoreQueries({
      reach: [{ phone: '+995500000060', reach: '90' }],
      // Plenty of people agree on the label — agreement was never the problem.
      aliases: [
        { phone: '+995500000060', contactId: 1, alias: label },
        { phone: '+995500000060', contactId: 2, alias: label },
        { phone: '+995500000060', contactId: 3, alias: label },
      ],
      askableCount: 50,
    });

    expect(await buildTargetList(30)).toEqual([]);
  });

  it('a real first name and surname still passes', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [{ phone: '+995500000061', label: 'Nika Kutsia' }]),
    ]);
    routeScoreQueries({
      aliases: [
        { phone: '+995500000061', contactId: 1, alias: 'Nika Kutsia' },
        { phone: '+995500000061', contactId: 2, alias: 'Nika Kutsia' },
      ],
      askableCount: 50,
    });

    expect((await buildTargetList(30)).map((e) => e.phone)).toEqual(['+995500000061']);
  });

  it('a surname the crowd is unsure of is still a person — one number is one person', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [{ phone: '+995500000062', label: 'Gia Melashvili' }]),
    ]);
    routeScoreQueries({
      aliases: [
        { phone: '+995500000062', contactId: 1, alias: 'Gia Melashvili' },
        { phone: '+995500000062', contactId: 2, alias: 'Gia Gldani' },
      ],
      askableCount: 50,
    });

    expect((await buildTargetList(30)).map((e) => e.phone)).toEqual(['+995500000062']);
  });

  it('the Georgian word for "and" is never a relationship word — it also opens დათო', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [{ phone: '+995500000063', label: 'დათო ხაზარაძე' }]),
    ]);
    routeScoreQueries({
      aliases: [
        { phone: '+995500000063', contactId: 1, alias: 'დათო ხაზარაძე' },
        { phone: '+995500000063', contactId: 2, alias: 'დათო ხაზარაძე' },
      ],
      askableCount: 50,
    });

    expect((await buildTargetList(30)).map((e) => e.phone)).toEqual(['+995500000063']);
  });
});

describe('task 23: the gates read the whole crowd, not one label', () => {
  it('excludes a taxi driver whose own candidate label says nothing — two other people do', async () => {
    // The real row: „Zura T" on the list, while „Taxi Zura" and
    // „ზურა ტაქსი ყვარელი" sit on the same number.
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [{ phone: '+995500000070', label: 'Zura T' }]),
    ]);
    routeScoreQueries({
      reach: [{ phone: '+995500000070', reach: '40' }],
      aliases: [
        { phone: '+995500000070', contactId: 1, alias: 'Taxi Zura' },
        { phone: '+995500000070', contactId: 2, alias: 'ზურა ტაქსი ყვარელი' },
        { phone: '+995500000070', contactId: 3, alias: 'ზურა როზომაშვილი' },
        { phone: '+995500000070', contactId: 4, alias: 'ზურა როზომაშვილი' },
      ],
      askableCount: 50,
    });

    expect(await buildTargetList(30)).toEqual([]);
  });

  it('one lone voice calling him a taxi is not the crowd', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [{ phone: '+995500000071', label: 'Zura Rozomashvili' }]),
    ]);
    routeScoreQueries({
      aliases: [
        { phone: '+995500000071', contactId: 1, alias: 'Taxi Zura' },
        { phone: '+995500000071', contactId: 2, alias: 'ზურა როზომაშვილი' },
        { phone: '+995500000071', contactId: 3, alias: 'ზურა როზომაშვილი' },
      ],
      askableCount: 50,
    });

    expect((await buildTargetList(30)).map((e) => e.phone)).toEqual(['+995500000071']);
  });

  it('shows the fuller name: „Kato" is what twelve people typed, „Kato Boxua" is who she is', async () => {
    mockFindUnmetNeeds.mockResolvedValue([need('x', [{ phone: '+995500000072', label: 'Kato' }])]);
    routeScoreQueries({
      aliases: [
        { phone: '+995500000072', contactId: 1, alias: 'Kato' },
        { phone: '+995500000072', contactId: 2, alias: 'Kato' },
        { phone: '+995500000072', contactId: 3, alias: 'Kato' },
        { phone: '+995500000072', contactId: 4, alias: 'Kato Boxua' },
      ],
      askableCount: 50,
    });

    const out = await buildTargetList(30);

    expect(out[0]?.label).toBe('Kato Boxua');
  });
});

describe('task 23: a flat, a door and a price are not people either', () => {
  it.each([
    ['Wina Korpusis Karebis Nomeri', 'the number of the front building door'],
    ['Orbi Batumi bina 60 GEL', 'a flat at sixty lari'],
  ])('%s is excluded (%s)', async (label) => {
    mockFindUnmetNeeds.mockResolvedValue([need('x', [{ phone: '+995500000080', label }])]);
    routeScoreQueries({
      reach: [{ phone: '+995500000080', reach: '50' }],
      aliases: [
        { phone: '+995500000080', contactId: 1, alias: label },
        { phone: '+995500000080', contactId: 2, alias: label },
        { phone: '+995500000080', contactId: 3, alias: label },
      ],
      askableCount: 50,
    });

    expect(await buildTargetList(30)).toEqual([]);
  });
});

describe('what MOST people call the number decides what it is (ticket 9, second pass)', () => {
  it('a Batumi flat stays out even when one saver’s label reads like a name', async () => {
    // The live row: 38 of 39 savers call +995557582210 „ბათუმი ორბი 2", and
    // its cloud is „Orbi Batumi bina 60 GEL", „Orbi Plaza", „ბინა ბათუმი".
    // It reached the list because ONE saver wrote „ORBI IAFAD", which
    // tokenises to two unknown words and reads as a full name.
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [{ phone: '+995500000090', label: 'ბათუმი ორბი 2' }]),
    ]);
    routeScoreQueries({
      aliases: [
        ...Array.from({ length: 6 }, (_, i) => ({
          phone: '+995500000090',
          contactId: i + 1,
          alias: 'ბათუმი ორბი 2',
        })),
        { phone: '+995500000090', contactId: 90, alias: 'ORBI IAFAD' },
        { phone: '+995500000090', contactId: 91, alias: 'Orbi Plaza' },
      ],
      askableCount: 50,
    });

    expect(await buildTargetList(30)).toEqual([]);
  });

  it('a real person whose commonest label is just a first name still passes', async () => {
    // The place/thing test must not swallow „Kato": her label carries no
    // place and no thing, so the crowd rule never fires on her.
    mockFindUnmetNeeds.mockResolvedValue([need('x', [{ phone: '+995500000091', label: 'Kato' }])]);
    routeScoreQueries({
      aliases: [
        { phone: '+995500000091', contactId: 1, alias: 'Kato' },
        { phone: '+995500000091', contactId: 2, alias: 'Kato' },
        { phone: '+995500000091', contactId: 3, alias: 'Kato Boxua' },
      ],
      askableCount: 50,
    });

    expect((await buildTargetList(30)).map((e) => e.phone)).toEqual(['+995500000091']);
  });
});

describe('our own people, named by the crowd (task 10 item 3)', () => {
  it('excludes someone 38 people saved as „(Ally)"', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [{ phone: '+995500000092', label: 'Luka Iashvili (Ally)' }]),
    ]);
    routeScoreQueries({
      aliases: [
        { phone: '+995500000092', contactId: 1, alias: 'Luka Iashvili' },
        { phone: '+995500000092', contactId: 2, alias: 'Luka Iashvili (Ally)' },
        { phone: '+995500000092', contactId: 3, alias: 'Luka Iashvili Ally' },
        { phone: '+995500000092', contactId: 4, alias: 'Ally Luka Iashvili' },
      ],
      askableCount: 50,
    });

    expect(await buildTargetList(30)).toEqual([]);
  });

  it('one stray „ally" in a label is a typo, not a job', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [{ phone: '+995500000093', label: 'Nino Alalishvili' }]),
    ]);
    routeScoreQueries({
      aliases: [
        { phone: '+995500000093', contactId: 1, alias: 'Nino Alalishvili' },
        { phone: '+995500000093', contactId: 2, alias: 'Nino Alalishvili' },
        { phone: '+995500000093', contactId: 3, alias: 'nino ally' },
      ],
      askableCount: 50,
    });

    expect((await buildTargetList(30)).map((e) => e.phone)).toEqual(['+995500000093']);
  });
});

describe('a Georgian who lives abroad is still a person (5 Sep)', () => {
  it('keeps a foreign number the crowd holds', async () => {
    // „Giga", +34…, saved by five different people — on the founder's own seed
    // list, and invisible to the engine because the gate asked for a Georgian
    // SIM rather than for a person.
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [{ phone: '+34689019541', label: 'Giga Demetrashvili' }]),
    ]);
    routeScoreQueries({
      reach: [{ phone: '+34689019541', reach: '5' }],
      aliases: [
        { phone: '+34689019541', contactId: 1, alias: 'Giga Demetrashvili' },
        { phone: '+34689019541', contactId: 2, alias: 'Giga Demetrashvili' },
        { phone: '+34689019541', contactId: 3, alias: 'Giga' },
      ],
      askableCount: 50,
    });

    expect((await buildTargetList(30)).map((e) => e.phone)).toEqual(['+34689019541']);
  });

  it('drops a foreign number only one person saved', async () => {
    mockFindUnmetNeeds.mockResolvedValue([
      need('x', [{ phone: '+447700900123', label: 'Some Onenumber' }]),
    ]);
    routeScoreQueries({
      reach: [{ phone: '+447700900123', reach: '1' }],
      aliases: [{ phone: '+447700900123', contactId: 1, alias: 'Some Onenumber' }],
      askableCount: 50,
    });

    expect(await buildTargetList(30)).toEqual([]);
  });

  it('still refuses a short code, whatever its reach', async () => {
    mockFindUnmetNeeds.mockResolvedValue([need('x', [{ phone: '8080', label: 'Info Line' }])]);
    routeScoreQueries({ reach: [{ phone: '8080', reach: '900' }], askableCount: 50 });

    expect(await buildTargetList(30)).toEqual([]);
  });
});
