jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import {
  approveTaskPlan,
  parsePlan,
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
    const [sql] = mockQuery.mock.calls[0] as [string];
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
