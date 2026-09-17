jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import {
  approveTaskPlan,
  parsePlan,
  nobodyCanBeWrittenTo,
  peopleToInvite,
  planAllows,
  planInForce,
  proposeTaskPlan,
  renderPlan,
  StoredPlan,
} from '../taskPlans.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

const RAW = {
  solved_when: 'ბათუმში ქორწილის ფოტოგრაფი შერჩეულია და თარიღი დაჯავშნილია',
  routes: [
    { name: 'ქსელში კითხვა', status: 'running' },
    { name: 'ვებ-ძიება', status: 'waiting' },
  ],
  people_to_involve: [
    { name: 'ლიკა ოსეფაშვილი', phone: '+995 599 11 22 33', route: 'ქსელში კითხვა' },
    { name: 'გია', phone: '+995599444555', route: 'ქსელში კითხვა' },
  ],
  never_contact: [{ name: 'ნანა', phone: '+995599999999' }, { name: 'ყოფილი პარტნიორი' }],
};

beforeEach(() => jest.clearAllMocks());

describe('reading a plan', () => {
  it('accepts the founder’s four parts and keeps them exact', () => {
    const out = parsePlan(RAW);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.routes).toHaveLength(2);
      expect(out.value.people_to_involve[0]?.route).toBe('ქსელში კითხვა');
      expect(out.value.never_contact).toHaveLength(2);
    }
  });

  it.each([
    [{ ...RAW, solved_when: '' }, 'solved_when'],
    [{ ...RAW, routes: [] }, 'route'],
    [{ ...RAW, routes: [{ name: 'x', status: 'maybe' }] }, 'status'],
    [{ ...RAW, people_to_involve: [{ name: 'გია', phone: '', route: 'ქსელში კითხვა' }] }, 'phone'],
    [
      { ...RAW, people_to_involve: [{ name: 'გია', phone: '+995599444555', route: 'nope' }] },
      'route',
    ],
  ])('refuses a plan the ask path could not enforce: %#', (raw, word) => {
    const out = parsePlan(raw);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain(word);
  });
});

describe('what the plan in force allows', () => {
  const plan: StoredPlan = {
    ...(parsePlan(RAW) as { ok: true; value: typeof RAW }).value,
    version: 1,
    approved_at: '2026-09-07T20:00:00Z',
  } as StoredPlan;

  it('a person the plan names goes without a per-message yes', () => {
    expect(planAllows(plan, '599 11 22 33')).toEqual({ allowed: true, reason: 'in_plan' });
  });

  it('a person on never_contact is refused', () => {
    expect(planAllows(plan, '+995599999999')).toEqual({ allowed: false, reason: 'never_contact' });
  });

  it('a person the plan does not name is a plan change', () => {
    expect(planAllows(plan, '+995599000000')).toEqual({ allowed: false, reason: 'outside_plan' });
  });

  it('no plan means the old rule decides', () => {
    expect(planAllows(null, '+995599000000')).toEqual({ allowed: true, reason: 'no_plan' });
    expect(planInForce({ plan: null, plan_version: 0, plan_approved_at: null })).toBeNull();
  });
});

describe('proposing and approving', () => {
  it('a proposal writes plan_proposed only — the plan in force keeps running', async () => {
    mockQuery.mockResolvedValue({ rows: [{ plan_version: 2 }], rowCount: 1 } as never);

    const out = await proposeTaskPlan('501', 1619, RAW);

    expect(out.ok).toBe(true);
    // Row 146 put the reachability lookups first, so the update is no longer
    // call zero. Found by what it IS rather than by where it sits, which is
    // what this test always meant.
    const sql = (mockQuery.mock.calls
      .map(([q]) => q as string)
      .find((q) => q.includes('UPDATE tasks')) ?? '') as string;
    expect(sql).toContain('SET plan_proposed = $3::jsonb');
    expect(sql).not.toContain('SET plan =');
    // Ticket 11 Task 8: every proposal is a new version — the row's version
    // after the bump is the one returned, so a change can never read as v1 twice.
    expect(sql).toContain('plan_version = plan_version + 1');
    if (out.ok) {
      expect(out.value.version).toBe(2);
      expect(out.value.summary).toContain('გეგმა v2 (დასამტკიცებელი)');
      expect(out.value.summary).toContain('ლიკა ოსეფაშვილი — ქსელში კითხვა');
    }
  });

  it('a malformed proposal never reaches the database', async () => {
    const out = await proposeTaskPlan('501', 1619, { solved_when: '' });
    expect(out.ok).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('the yes moves the proposal into force and grants the blanket permission with it', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ plan: RAW, plan_version: 3, plan_approved_at: '2026-09-07T20:00:00Z' }],
      rowCount: 1,
    } as never);

    const out = await approveTaskPlan('501', 1619);

    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain('SET plan = plan_proposed');
    expect(sql).toContain('permission_granted = TRUE');
    expect(sql).toContain('plan_proposed IS NOT NULL');
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.summary).toContain('დამტკიცებულია');
  });

  it('a yes with nothing proposed records nothing', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    const out = await approveTaskPlan('501', 1619);
    expect(out).toEqual({ ok: false, error: 'No proposed plan is waiting on this goal.' });
  });
});

describe('the summary the user approves', () => {
  it('names the four parts and never a phone number', () => {
    const text = renderPlan((parsePlan(RAW) as { ok: true; value: typeof RAW }).value, 1, null);
    expect(text).toContain('მოგვარებულია, როცა:');
    expect(text).toContain('გზები:');
    expect(text).toContain('ვის ვკითხავ:');
    expect(text).toContain('ვის არასდროს:');
    expect(text).not.toMatch(/\d{6}/);
  });
});

/**
 * Ticket 18 [101]. The plan the user is asked to approve reached the screen
 * only because the model happened to narrate it, and narration is stored as a
 * `step` row — which getThreadMessages filters out. Read on goal #2773 on
 * 13 September: the plan was a 651-character step, the 715-character answer
 * beside it carried the buttons and no plan, and after a reload the plan was
 * nowhere while the buttons stayed.
 *
 * `renderPlan` is what the server now writes as its own durable message, so
 * what a person approves cannot depend on a model repeating it. This pins the
 * shape of that text: everything the tester asked to see above the buttons.
 */
describe('Ticket 18 [101]: the plan text carries what is being approved', () => {
  const plan = {
    solved_when: 'თორნიკე იღებს სანდო ოსტატის კონტაქტს',
    routes: [{ name: 'ქსელი', status: 'open' }],
    people_to_involve: [
      { name: 'Beso Ortoidze', route: 'ქსელი' },
      { name: 'Tiko Ratiani', route: 'ქსელი' },
    ],
    never_contact: [{ name: 'ნანა' }],
  } as unknown as Parameters<typeof renderPlan>[0];

  it('names the finish criterion, the routes and every person it will write to', () => {
    const text = renderPlan(plan, 1, null);

    expect(text).toContain('თორნიკე იღებს სანდო ოსტატის კონტაქტს');
    expect(text).toContain('ქსელი');
    // The three the tester could not see: who gets written to, by name.
    expect(text).toContain('Beso Ortoidze');
    expect(text).toContain('Tiko Ratiani');
    expect(text).toContain('ნანა');
    // And that it is still awaiting the yes, not already approved.
    expect(text).toContain('დასამტკიცებელი');
  });

  it('says approved once it is, so the two states never read alike', () => {
    expect(renderPlan(plan, 1, '2026-09-13T10:00:00.000Z')).toContain('დამტკიცებულია');
  });
});

describe('Ticket 19 [3]: the plan reads like a sentence, not a dump', () => {
  const PLAN = {
    solved_when: 'ვპოულობ სანტექნიკოსს',
    routes: [
      { name: 'ქსელში კითხვა', status: 'waiting' as const },
      { name: 'ვებ-ძიება', status: 'running' as const },
    ],
    people_to_involve: [
      { name: 'Dato Karada', phone: '+995500000001', route: 'Dato Karada' },
      { name: 'Nino Beridze', phone: '+995500000002', route: 'ქსელში კითხვა' },
    ],
    never_contact: [],
  };

  it('says the state in words a person uses, not the field value', () => {
    const text = renderPlan(PLAN, 1, null);

    // „[waiting]" is an internal value, in English, inside a Georgian message
    // that exists to be understood well enough to approve.
    expect(text).not.toContain('[waiting]');
    expect(text).not.toContain('[running]');
    expect(text).toContain('ველოდები');
    expect(text).toContain('მიმდინარეობს');
  });

  it('never prints a person twice', () => {
    // The live plan read „Dato Karada — Dato Karada", which tells the reader
    // nothing and looks like a fault in the product.
    const text = renderPlan(PLAN, 1, null);

    expect(text).toContain('- Dato Karada\n');
    expect(text).not.toContain('Dato Karada — Dato Karada');
    // A route that genuinely differs is still shown.
    expect(text).toContain('Nino Beridze — ქსელში კითხვა');
  });

  it('leaves out the exclusions section rather than listing nobody', () => {
    const text = renderPlan(PLAN, 1, null);

    expect(text).not.toContain('(არავინ)');
    expect(text).not.toContain('ვის არასდროს');
  });

  it('still shows the exclusions when there are any', () => {
    const text = renderPlan({ ...PLAN, never_contact: [{ name: 'Giorgi' }] }, 1, null);

    expect(text).toContain('ვის არასდროს');
    expect(text).toContain('- Giorgi');
  });

  it('says plainly when nobody is on the list yet', () => {
    const text = renderPlan({ ...PLAN, people_to_involve: [] }, 1, null);

    expect(text).not.toContain('(ჯერ არავინ)');
    expect(text).toContain('ჯერ არავის');
  });
});

describe('Ticket 19 [0], third part: the approval records who made it', () => {
  it('writes the actor and the route, not only the time', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          plan: { solved_when: 'x', routes: [], people_to_involve: [], never_contact: [] },
          plan_version: 2,
          plan_approved_at: '2026-09-15T11:00:00.000Z',
        },
      ],
      rowCount: 1,
    } as never);

    await approveTaskPlan('501', 2872);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('plan_approved_by');
    expect(sql).toContain('plan_approved_via');
    // The owner's session is the default route, because that is where every
    // existing caller approves from.
    expect(params[3]).toBe('chat');
    expect(params[2]).toBe('501');
  });

  it('lets the admin panel name itself instead of borrowing the owner', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          plan: { solved_when: 'x', routes: [], people_to_involve: [], never_contact: [] },
          plan_version: 1,
          plan_approved_at: '2026-09-15T11:00:00.000Z',
        },
      ],
      rowCount: 1,
    } as never);

    await approveTaskPlan('501', 2872, 'admin');

    expect((mockQuery.mock.calls[0] as [string, unknown[]])[1][3]).toBe('admin');
  });
});

/**
 * Ticket 20 row 101a — matching a person to their route, forgivingly.
 *
 * Tornike's choice of 16 September, option (a); option (b), routes by number,
 * follows as the real fix.
 *
 * The rule required people_to_involve[].route to repeat a route name EXACTLY.
 * error_text caught the cost the same hour it was added: four of four refused
 * propose_task_plan calls said „person <name>: route must name one of the
 * plan's routes", and the model's retry each time was to SHORTEN its own route
 * names until they matched — two whole runs per goal, spent copying a
 * sixty-character Georgian string.
 *
 * The TIE is not relaxed. A person still has to belong to a real route,
 * because the ask path enforces it. Only the comparison is.
 */
describe('row 101a — the route match forgives spelling, not membership', () => {
  const twoRoutes = {
    solved_when: 'ნაპოვნია ხელოსანი',
    routes: [
      { name: 'Eka Malazonia — ორ მასაჟისტს იცნობს', status: 'waiting' },
      { name: 'მეორე წრის სრული ძიება', status: 'waiting' },
    ],
    never_contact: [],
  };

  function withRoute(route: string, routes = twoRoutes.routes): ReturnType<typeof parsePlan> {
    return parsePlan({
      ...twoRoutes,
      routes,
      people_to_involve: [{ name: 'Eka', phone: '+995599111222', route }],
    });
  }

  it('an exact name still matches, which is the case that always worked', () => {
    const out = withRoute('Eka Malazonia — ორ მასაჟისტს იცნობს');
    expect(out.ok).toBe(true);
  });

  it.each([
    ['  Eka Malazonia — ორ მასაჟისტს იცნობს  ', 'surrounding whitespace'],
    ['Eka Malazonia —  ორ   მასაჟისტს იცნობს', 'repeated inner whitespace'],
    ['eka malazonia — ორ მასაჟისტს იცნობს', 'a different case'],
  ])('matches through %s (%s)', (route) => {
    const out = withRoute(route);
    expect(out.ok).toBe(true);
  });

  it('stores the ROUTE’s own spelling, never the person’s', () => {
    const out = withRoute('eka malazonia — ორ მასაჟისტს იცნობს');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // Otherwise the plan disagrees with itself about what its routes are called.
    expect(out.value.people_to_involve[0].route).toBe('Eka Malazonia — ორ მასაჟისტს იცნობს');
    expect(out.value.routes.map((r) => r.name)).toContain(out.value.people_to_involve[0].route);
  });

  it('a plan with ONE route needs no naming — there is nothing to be ambiguous between', () => {
    const out = withRoute('whatever the model felt like calling it', [
      { name: 'ქსელში კითხვა', status: 'waiting' },
    ]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.people_to_involve[0].route).toBe('ქსელში კითხვა');
  });

  /** The half that must NOT relax: a person still belongs to a real route. */
  it('a name matching no route on a multi-route plan is still refused', () => {
    const out = withRoute('a third road nobody listed');
    expect(out.ok).toBe(false);
  });

  it('the refusal now NAMES the routes, so the model need not guess at them', () => {
    const out = withRoute('a third road nobody listed');
    expect(out.ok).toBe(false);
    if (out.ok) return;
    // Guessing is what cost a whole extra run each time: the model rewrote its
    // own plan until the strings lined up.
    expect(out.error).toContain('Eka Malazonia — ორ მასაჟისტს იცნობს');
    expect(out.error).toContain('მეორე წრის სრული ძიება');
  });
});

/**
 * Ticket 20 row 146 — a plan whose people cannot be asked, said BEFORE the yes.
 *
 * Tornike's own goal 3763, 16 September, a volleyball coach for his child. The
 * plan named three people. He approved it at 15:50:28. At 15:51:15 all three
 * ask_contact calls were refused, every one of them „has an account but has
 * not opened Netai". He was never told, before saying yes, that not one of the
 * three could be reached — and the goal then set its next wake for 18
 * September and slept.
 */
describe('row 146 — the plan says who cannot be reached', () => {
  const PEOPLE = [
    { name: 'Gega', phone: '+995599111111', route: 'ქსელში კითხვა' },
    { name: 'Nino', phone: '+995599222222', route: 'ქსელში კითხვა' },
  ];
  const PLAN = {
    solved_when: 'მწვრთნელი ნაპოვნია',
    routes: [{ name: 'ქსელში კითხვა', status: 'waiting' }],
    people_to_involve: PEOPLE,
    never_contact: [],
  };

  it('marks a member who has never opened Netai, in the owner’s words', () => {
    const parsed = parsePlan(PLAN);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const summary = renderPlan(
      {
        ...parsed.value,
        people_to_involve: [
          { ...parsed.value.people_to_involve[0], reach: 'never_opened' as const },
          { ...parsed.value.people_to_involve[1], reach: 'ok' as const },
        ],
      },
      1,
      null,
    );

    expect(summary).toContain('Netai ჯერ არ გაუხსნია');
    // And says nothing about the one who can be reached.
    expect(summary).toMatch(/Nino(?!.*გაუხსნია)/);
  });

  it('warns ABOVE the list when the plan can reach nobody it names', () => {
    const parsed = parsePlan(PLAN);
    if (!parsed.ok) return;

    const summary = renderPlan(
      {
        ...parsed.value,
        people_to_involve: parsed.value.people_to_involve.map((p) => ({
          ...p,
          reach: 'never_opened' as const,
        })),
      },
      1,
      null,
    );

    expect(summary).toContain('არცერთ ადამიანს ვერ მივწერ');
    // Above the list, because a warning under it is read after the decision.
    expect(summary.indexOf('არცერთ ადამიანს')).toBeLessThan(summary.indexOf('ვის ვკითხავ'));
  });

  it('a plan with one reachable person carries no blanket warning', () => {
    const parsed = parsePlan(PLAN);
    if (!parsed.ok) return;

    const summary = renderPlan(
      {
        ...parsed.value,
        people_to_involve: [
          { ...parsed.value.people_to_involve[0], reach: 'never_opened' as const },
          { ...parsed.value.people_to_involve[1], reach: 'ok' as const },
        ],
      },
      1,
      null,
    );

    expect(summary).not.toContain('არცერთ ადამიანს ვერ მივწერ');
  });

  it('an unknown reach says nothing at all — a failed lookup invents no claim', () => {
    const parsed = parsePlan(PLAN);
    if (!parsed.ok) return;

    // `reach` undefined is every plan stored before the column existed, and
    // every lookup that failed. Neither is evidence about a person.
    const summary = renderPlan(parsed.value, 1, null);

    expect(summary).toContain('Gega');
    expect(summary).not.toContain('ვერ მივწერ');
    expect(summary).not.toContain('გაუხსნია');
  });
});

/**
 * Ticket 20 row 203 — the predicate that removes the approve button.
 */
describe('nobodyCanBeWrittenTo', () => {
  const person = (name: string, reach?: 'ok' | 'not_member' | 'never_opened') => ({
    name,
    phone: '+995500000001',
    route: 'ქსელში კითხვა',
    ...(reach !== undefined && { reach }),
  });
  const planWith = (people: ReturnType<typeof person>[]) => ({
    solved_when: 'x',
    routes: [{ name: 'ქსელში კითხვა', status: 'running' as const }],
    people_to_involve: people,
    never_contact: [],
  });

  it('is true when not one named person can be written to', () => {
    expect(
      nobodyCanBeWrittenTo(
        planWith([person('ლევანი', 'not_member'), person('ილია', 'never_opened')]),
      ),
    ).toBe(true);
  });

  it('is false when even one can', () => {
    expect(
      nobodyCanBeWrittenTo(planWith([person('ლევანი', 'not_member'), person('გეგა', 'ok')])),
    ).toBe(false);
  });

  it('is false for a plan that names nobody', () => {
    // "Write to nobody" is a plan working exactly as intended. The owner who
    // asked for it must not be shown an invitation card about people they
    // told us to leave alone.
    expect(nobodyCanBeWrittenTo(planWith([]))).toBe(false);
  });

  it('treats an unknown reach as reachable, never as a closed door', () => {
    // The lookup failing is not evidence that a door is shut, and this
    // predicate removes a button — an unknown must not do that.
    expect(nobodyCanBeWrittenTo(planWith([person('ლევანი')]))).toBe(false);
  });
});

describe('peopleToInvite', () => {
  const p = (name: string, reach: 'ok' | 'not_member' | 'never_opened') => ({
    name,
    phone: '+995500000001',
    route: 'r',
    reach,
  });
  const planWith = (people: ReturnType<typeof p>[]) => ({
    solved_when: 'x',
    routes: [{ name: 'r', status: 'running' as const }],
    people_to_involve: people,
    never_contact: [],
  });

  it('names only the people an invitation would actually help', () => {
    // never_opened has an account already — inviting them again is advice
    // that cannot work.
    expect(
      peopleToInvite(
        planWith([p('ლევანი', 'not_member'), p('ილია', 'never_opened'), p('გეგა', 'ok')]),
      ),
    ).toEqual(['ლევანი']);
  });
});
