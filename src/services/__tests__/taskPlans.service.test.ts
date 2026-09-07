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
    if (out.ok) {
      expect(out.value.version).toBe(3);
      expect(out.value.summary).toContain('გეგმა v3 (დასამტკიცებელი)');
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
