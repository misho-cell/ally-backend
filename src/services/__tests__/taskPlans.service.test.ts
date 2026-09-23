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
      /**
       * Row 206: the route is no longer reprinted beside a name when the plan
       * has only one route, because that is what made a card say the same
       * passage three times. 35 of 51 cards on one account repeated a block of
       * 40+ characters; 20 of them three to five times; and the count was
       * exactly `1 + people`. This plan has one route, so the person is listed
       * by name alone and the route appears once, in the routes list above.
       */
      expect(out.value.summary).toContain('- ლიკა ოსეფაშვილი');
      expect(out.value.summary).not.toContain('ლიკა ოსეფაშვილი — ქსელში კითხვა');
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
    // Both reads ran: the UPDATE found nothing, and the row was then asked
    // whether a plan is standing. Neither found one, so this really is the
    // „nothing to approve" case and not the „already approved" one.
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});

/**
 * Ticket 20 row 209 — a second yes on the same plan.
 *
 * Goal 5580, 18 September: the owner typed „ვამტკიცებ" and then „ok" three
 * seconds later, which started a second run, and the two raced. The first
 * approval won; the second was told „No proposed plan is waiting on this
 * goal." The run that got that sentence had an owner who had plainly said yes
 * and a tool saying no plan existed, so it did day one's work by hand — and
 * day one then wrote to the same two people again, forty seconds later.
 *
 * The UPDATE is idempotent by construction and always was. What was not true
 * was what it SAID about having changed nothing.
 */
describe('approving a plan that is already in force', () => {
  const APPROVED = {
    rows: [{ plan: RAW, plan_version: 3, plan_approved_at: '2026-09-18T12:52:08.012Z' }],
    rowCount: 1,
  };

  it('is a success, not an error, and says it changed nothing', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never) // the UPDATE
      .mockResolvedValueOnce(APPROVED as never); // the plan standing

    const out = await approveTaskPlan('501', 5580);

    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.alreadyInForce).toBe(true);
      expect(out.value.version).toBe(3);
      expect(out.value.approvedAt).toBe('2026-09-18T12:52:08.012Z');
      // The summary is the real plan's, so a caller can show it rather than
      // having to explain an error it cannot see behind.
      expect(out.value.summary).toContain('მოგვარებულია, როცა:');
    }
  });

  it('reads only an OPEN goal’s standing plan, never a closed one', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce(APPROVED as never);

    await approveTaskPlan('501', 5580);

    const [sql, params] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain("status = 'open'");
    expect(sql).toContain('plan_approved_at IS NOT NULL');
    // Parameterised, and scoped to the owner — a goal id alone must never be
    // enough to read somebody else's plan.
    expect(params).toEqual([5580, '501']);
    expect(sql).toContain('$1');
    expect(sql).toContain('$2');
  });

  it('marks a FRESH approval as the one that changed something', async () => {
    mockQuery.mockResolvedValueOnce(APPROVED as never);

    const out = await approveTaskPlan('501', 5580);

    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.alreadyInForce).toBe(false);
    // One query. The second read exists only for the branch that needs it.
    expect(mockQuery).toHaveBeenCalledTimes(1);
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
    // Rendered as an APPROVED plan now. Ticket 20 row 140 changed what an
    // unapproved one may claim — see below — and this assertion is about the
    // vocabulary, not about the claim, so it moves to a plan where the
    // statuses are allowed to speak.
    const text = renderPlan(PLAN, 1, '2026-09-17T07:00:00Z');

    // „[waiting]" is an internal value, in English, inside a Georgian message
    // that exists to be understood well enough to approve.
    expect(text).not.toContain('[waiting]');
    expect(text).not.toContain('[running]');
    expect(text).toContain('ველოდები');
    expect(text).toContain('მიმდინარეობს');
  });

  /**
   * Ticket 20 row 140 — „in progress" on a route nothing has started.
   *
   * Goal 3703's plan read „ვები, რუსთავის ელექტრიკოსები, მიმდინარეობს" with no
   * web_search in the run. Goal 3928's v1 marked all three routes in progress
   * while nothing was approved and nobody had been written to. On an
   * unapproved plan that is false by construction: the product's own rule is
   * that nothing starts until the owner says yes.
   */
  describe('row 140 — an unapproved plan claims no progress', () => {
    /**
     * The assertion changed from „it says not started yet" to „it says nothing
     * about progress at all", because the card is a stored message that is
     * never re-rendered: „not started yet" was true when written and false two
     * minutes later, over two asks already delivered. The property row 140
     * exists for — no claim of progress on an unapproved plan — is unchanged
     * and is asserted here directly, on the route line itself rather than on
     * the whole card, so a status word cannot reappear beside a route name.
     */
    it('claims nothing at all about a route, whatever the model wrote', () => {
      const text = renderPlan(PLAN, 1, null);

      expect(text).not.toContain('მიმდინარეობს');
      expect(text).not.toContain('ველოდები');
      expect(text).not.toContain('ჯერ არ დაწყებულა');
      for (const route of PLAN.routes) expect(text).toContain(`- ${route.name}\n`);
    });

    it('lets the statuses speak once the plan is approved', () => {
      const text = renderPlan(PLAN, 1, '2026-09-17T07:00:00Z');

      expect(text).toContain('მიმდინარეობს');
      expect(text).not.toContain('ჯერ არ დაწყებულა');
    });

    it('lets a v2 speak, because work on that goal really has begun', () => {
      // The exception, and the reason this takes a flag rather than reading
      // approvedAt: a revision proposed after v1 was approved is itself
      // unapproved, but the goal has been running. „Not started" there would
      // be the same fault pointing the other way.
      const text = renderPlan(PLAN, 2, null, true);

      expect(text).toContain('მიმდინარეობს');
      expect(text).not.toContain('ჯერ არ დაწყებულა');
    });

    it('does not rewrite what the model stored', () => {
      // The intent stays recorded; only the claim is withheld, so it becomes
      // visible the moment there is something it could honestly describe.
      const before = JSON.stringify(PLAN);
      renderPlan(PLAN, 1, null);
      expect(JSON.stringify(PLAN)).toBe(before);
    });
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

  /**
   * Second cut, 20 September. Case and whitespace were not the whole of it:
   * 21 of the 95 propose_task_plan refusals of the last fourteen days are
   * still this one. The comment above already said what the near-miss is —
   * the model shortens its own route name — so containment is allowed, and
   * only where it can point at exactly one road.
   */
  it('a SHORTENED route name matches the route it is the start of', () => {
    const out = withRoute('Eka Malazonia');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.people_to_involve[0].route).toBe('Eka Malazonia — ორ მასაჟისტს იცნობს');
  });

  it('a LONGER name containing the route matches it too', () => {
    const out = withRoute('via მეორე წრის სრული ძიება, second pass');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.people_to_involve[0].route).toBe('მეორე წრის სრული ძიება');
  });

  it('but an ambiguous shortening is refused — choosing would be a guess', () => {
    const out = withRoute('ძიება', [
      { name: 'ძიება ტეგებით', status: 'waiting' },
      { name: 'ძიება ვებში', status: 'waiting' },
    ]);
    expect(out.ok).toBe(false);
  });

  it('and an empty route on a multi-route plan is refused, not matched to all', () => {
    const out = withRoute('');
    expect(out.ok).toBe(false);
  });

  /**
   * The refusal says WHAT WAS REJECTED. Without it the model is asked to diff
   * its own call against a list, and the log inherits the same blind spot:
   * args_summary stops at 300 characters, so reading twenty-one of these back
   * showed the routes offered and never once the route said.
   */
  it('the refusal quotes the route that was rejected', () => {
    const out = withRoute('a third road nobody listed');
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toContain('"a third road nobody listed"');
  });
});

/**
 * 20 September. Seven of 314 propose_task_plan calls over fourteen days were
 * refused for nothing but a JSON object arriving as the TEXT of that object —
 * four sending the whole plan that way, the rest sending an array of real
 * route objects with one double-encoded element sitting among them. Each cost
 * a whole run on a live goal.
 */
describe('a plan that arrived as its own JSON text', () => {
  const PLAN = {
    solved_when: 'ნაპოვნია ხელოსანი',
    routes: [{ name: 'ქსელში კითხვა', status: 'waiting' }],
    people_to_involve: [],
    never_contact: [],
  };

  it('the whole plan, double-encoded, is read', () => {
    const out = parsePlan(JSON.stringify(PLAN));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.routes[0].name).toBe('ქსელში კითხვა');
  });

  it('ONE route double-encoded beside real objects — the live shape', () => {
    const out = parsePlan({
      ...PLAN,
      routes: [
        { name: 'Ask direct contacts who might know a mover', status: 'waiting' },
        JSON.stringify({ name: 'Web search for movers in Tbilisi', status: 'waiting' }),
      ],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.routes.map((r) => r.name)).toEqual([
      'Ask direct contacts who might know a mover',
      'Web search for movers in Tbilisi',
    ]);
  });

  it('a person double-encoded is read, and still validated', () => {
    const out = parsePlan({
      ...PLAN,
      people_to_involve: [
        JSON.stringify({ name: 'Gega', phone: '+995599111111', route: 'ქსელში კითხვა' }),
      ],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.people_to_involve[0].name).toBe('Gega');
  });

  /**
   * Nothing is loosened by decoding: the decoded value goes through exactly
   * the checks an object that arrived as one goes through.
   */
  it('a decoded person with no phone is refused exactly as an object would be', () => {
    const out = parsePlan({
      ...PLAN,
      people_to_involve: [JSON.stringify({ name: 'Gega', route: 'ქსელში კითხვა' })],
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toContain('phone id');
  });

  it('a string that is not JSON is still refused, and says the same thing', () => {
    const out = parsePlan('I will ask around and get back to you');
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe('plan must be an object');
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

/**
 * The seat's #4061 (h), the last thing the server wrote in Georgian whatever
 * the owner typed. The card is the message somebody reads before deciding
 * whether to let us write to their friends in their name — so if any line of
 * it is worth reading, all of them are worth reading in their language.
 */
describe('the plan card follows the conversation’s language', () => {
  const plan = (parsePlan(RAW) as { ok: true; value: typeof RAW }).value;

  it('writes every heading in English in an English thread', () => {
    const text = renderPlan(plan, 1, null, false, 'en');

    expect(text).toContain('Plan v1 (awaiting your approval)');
    expect(text).toContain('Solved when:');
    expect(text).toContain('Routes:');
    expect(text).toContain('Who I will ask:');
    // An unapproved card carries no route status word in ANY language now, so
    // there is no English one left to check for here — it is asserted absent
    // instead. The English coverage of the status vocabulary lives on the
    // approved card, in the sibling test below.
    expect(text).not.toContain('not started yet');
    // Not „no Georgian anywhere": this plan's solved-when, its routes and its
    // people are Georgian because the OWNER and the model wrote them that way,
    // and translating somebody's own words would be a different and worse bug.
    // What must be gone is the product's own vocabulary.
    expect(text).not.toMatch(/დასამტკიცებელი|მოგვარებულია|გზები|ვის ვკითხავ|ჯერ არ დაწყებულა/);
  });

  it('says approved, not awaiting, once it is', () => {
    expect(renderPlan(plan, 2, '2026-09-17T21:00:00Z', true, 'en')).toContain('Plan v2 (approved)');
  });

  it('keeps Georgian for a caller that names no language', () => {
    expect(renderPlan(plan, 1, null)).toBe(renderPlan(plan, 1, null, false, 'ka'));
  });

  it('carries the names and the solved-when through untranslated', () => {
    // Only the product's own words move. What the owner and the model wrote
    // stays exactly as written.
    for (const lang of ['ka', 'en', 'ru', 'es'] as const) {
      const text = renderPlan(plan, 1, null, false, lang);
      expect(text).toContain(plan.solved_when);
      for (const p of plan.people_to_involve) expect(text).toContain(p.name);
    }
  });
});

/**
 * Row 206, measured and then PREDICTED by the seat, which is what turned it
 * from an observation into a rule.
 *
 * One account, 51 plan cards: 35 repeat a passage of 40 characters or more,
 * and 20 repeat it three, four or five times. On the cards that have one, the
 * repeated block is 15% to 44% of the card.
 *
 * The cause was the template printing the route once in the routes list and
 * then again beside every person, so the same text appeared `1 + people`
 * times. They predicted it before confirming it: the same goal's v1 named two
 * people and repeated a 72-character passage three times; v2, forty-three
 * minutes later, named one person and repeated a 70-character passage twice.
 * Both came out exactly as the rule says.
 */
describe('row 206 — a plan card says a thing once', () => {
  const oneRoute = {
    solved_when: 'x',
    routes: [{ name: 'ask the network about a wedding photographer', status: 'running' as const }],
    people_to_involve: [
      {
        name: 'ლიკა',
        phone: '+995599112233',
        route: 'ask the network about a wedding photographer',
      },
      {
        name: 'გია',
        phone: '+995599444555',
        route: 'ask the network about a wedding photographer',
      },
    ],
    never_contact: [],
  };

  it('names the route exactly once, whatever the number of people', () => {
    const text = renderPlan(oneRoute, 1, null);
    const count = text.split('ask the network about a wedding photographer').length - 1;
    // Two people used to give three. The whole of row 206's distribution is
    // this number being anything but one.
    expect(count).toBe(1);
    // And both people are still named — the repetition went, the content did not.
    expect(text).toContain('- ლიკა');
    expect(text).toContain('- გია');
  });

  it('still tells people apart when they really are on different routes', () => {
    // The case the suffix was for, and not the case that caused the repeats:
    // with two routes among the named people, a bare list of names would not
    // say who is being asked as part of what.
    const twoRoutes = {
      ...oneRoute,
      routes: [
        { name: 'ask the network', status: 'running' as const },
        { name: 'search the web', status: 'running' as const },
      ],
      people_to_involve: [
        { name: 'ლიკა', phone: '+995599112233', route: 'ask the network' },
        { name: 'გია', phone: '+995599444555', route: 'search the web' },
      ],
    };
    const text = renderPlan(twoRoutes, 1, null);
    expect(text).toContain('- ლიკა — ask the network');
    expect(text).toContain('- გია — search the web');
  });
});

/**
 * THE REFUSAL THAT TOLD THE MODEL THE ONE THING THAT WAS NOT TRUE.
 *
 * Six times in seven days — the last on goal 9871 at 16:55 on 23 September —
 * `propose_task_plan` answered „plan must be an object". I read what was
 * actually passed in all six instead of imagining it, and every one of them
 * was a JSON object sent as a string:
 *
 *     plan={"solved_when": "You have the name and contact of a good
 *            electrician for your Tbilisi office", "routes": [{"name": …
 *
 * The decoder exists for exactly that and tries to parse it. When the parse
 * fails — a plan cut off by the model's output limit is the likely cause — the
 * string is handed back and the next line calls it „not an object".
 *
 * So the model was told to fix the one thing it had got right. It sent an
 * object; what it did not send was valid JSON. Each of those six cost a run on
 * a live goal while the owner waited.
 */
describe('a plan that arrived as broken JSON says so', () => {
  it('names the parse failure and the length instead of the shape', () => {
    const cutOff = '{"solved_when": "You have the name of a good electrician", "routes": [{"nam';

    const out = parsePlan(cutOff);

    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toContain('not valid JSON');
    expect(out.error).toContain(String(cutOff.length));
    expect(out.error).toContain('cut off');
    expect(out.error).not.toBe('plan must be an object');
  });

  /** And the old message survives for things that are genuinely not objects. */
  it.each([['a bare sentence'], [42], [null]])('still refuses %p as not an object', (bad) => {
    const out = parsePlan(bad);

    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe('plan must be an object');
  });

  /** A well-formed plan sent as text keeps working — that decoder is why. */
  it('still accepts a valid plan that arrived as text', () => {
    const out = parsePlan(
      JSON.stringify({
        solved_when: 'The owner has an electrician',
        routes: [{ name: 'ask direct contacts', status: 'waiting' }],
      }),
    );

    expect(out.ok).toBe(true);
  });
});
