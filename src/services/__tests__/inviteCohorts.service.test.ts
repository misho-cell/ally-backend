jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import {
  createCohort,
  deactivateCohort,
  findCohortByCode,
  grantCohortTrial,
  listCohortMembers,
  normalizeCohortCode,
} from '../inviteCohorts.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

const AXEL = {
  code: 'AXEL2026',
  name: 'Axel launch, September 2026',
  trial_days: 20,
  tier: 'pro',
  active: true,
  note: null,
  created_by: '501',
  created_at: '2026-09-07T20:00:00.000Z',
};

beforeEach(() => jest.clearAllMocks());

describe('the code', () => {
  it('is compared case-insensitively and stored upper-case', async () => {
    mockQuery.mockResolvedValue(rows([AXEL]) as never);

    await findCohortByCode('  axel2026 ');

    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['AXEL2026']);
    expect(normalizeCohortCode('axel2026')).toBe('AXEL2026');
  });

  it('an empty or absurd code is not looked up at all', async () => {
    expect(await findCohortByCode('   ')).toBeNull();
    expect(await findCohortByCode('x'.repeat(40))).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('opening a cohort', () => {
  it('refuses a malformed code, a blank name, and a period outside 1–90 days', async () => {
    expect(await createCohort({ code: 'has space', name: 'x', trial_days: 20 }, '501')).toEqual({
      created: false,
      error: expect.stringContaining('code'),
    });
    expect(await createCohort({ code: 'OK', name: '  ', trial_days: 20 }, '501')).toEqual({
      created: false,
      error: 'name is required',
    });
    expect(await createCohort({ code: 'OK', name: 'x', trial_days: 0 }, '501')).toEqual({
      created: false,
      error: expect.stringContaining('trial_days'),
    });
    expect(await createCohort({ code: 'OK', name: 'x', trial_days: 91 }, '501')).toEqual({
      created: false,
      error: expect.stringContaining('trial_days'),
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('writes the cohort upper-cased with the founder as author, and defaults the tier to pro', async () => {
    mockQuery.mockResolvedValue(rows([AXEL]) as never);

    const out = await createCohort(
      { code: 'axel2026', name: 'Axel launch, September 2026', trial_days: 20 },
      '501',
    );

    expect(out).toEqual({ created: true, cohort: AXEL });
    expect(mockQuery.mock.calls[0]?.[1]).toEqual([
      'AXEL2026',
      'Axel launch, September 2026',
      20,
      'pro',
      null,
      '501',
    ]);
  });

  it('refuses to overwrite an existing code', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    const out = await createCohort({ code: 'AXEL2026', name: 'again', trial_days: 5 }, '501');

    expect(out).toEqual({ created: false, error: 'a cohort with code AXEL2026 already exists' });
  });

  it('closing a door reports whether it was open', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    expect(await deactivateCohort('axel2026')).toBe(true);
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    expect(await deactivateCohort('axel2026')).toBe(false);
  });
});

describe('granting the period at the door', () => {
  it('opens the account trialing for the cohort’s days and spends the one trial', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await grantCohortTrial(9001, '+995 599 12 34 56', AXEL);

    const [userSql, userParams] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(userSql).toContain("subscription_status = 'trialing'");
    expect(userSql).toContain('trial_ends_at = NOW() + make_interval(days => $3)');
    expect(userSql).toContain('subscription_status_changed_at = NOW()');
    expect(userSql).toContain('invite_cohort = $4');
    expect(userParams).toEqual([9001, 'pro', 20, 'AXEL2026']);

    // Day 21's Stripe checkout must find the trial already used (migration 104).
    const [trialSql, trialParams] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(trialSql).toContain('INSERT INTO stripe_trial_consumed');
    expect(trialParams).toEqual(['995599123456', 'cohort:AXEL2026']);
  });

  it('does not touch the trial table when the phone has no digits', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await grantCohortTrial(9001, '---', AXEL);

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

// Task 26 / 28: the founder's day-20 and day-40 lists — who used what, who paid.
describe('listCohortMembers', () => {
  it('reads usage and payment beside the state, and filters by day', async () => {
    mockQuery.mockResolvedValue(
      rows([
        {
          user_id: 171078,
          name: 'ნინო',
          registered_at: '2026-08-19T10:00:00.000Z',
          day: '20',
          subscription_status: 'trialing',
          trial_ends_at: '2026-09-08T10:00:00.000Z',
          threads: '4',
          tasks_with_action: '1',
          asks_answered: '2',
          paid: false,
          last_active_at: new Date('2026-09-07T18:00:00Z'),
        },
      ]) as never,
    );

    const members = await listCohortMembers('axel2026', 20);

    expect(members).toEqual([
      {
        user_id: 171078,
        name: 'ნინო',
        registered_at: '2026-08-19T10:00:00.000Z',
        day: 20,
        subscription_status: 'trialing',
        trial_ends_at: '2026-09-08T10:00:00.000Z',
        threads: 4,
        tasks_with_action: 1,
        asks_answered: 2,
        paid: false,
        last_active_at: '2026-09-07T18:00:00.000Z',
      },
    ]);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FROM payment_events');
    expect(sql).toContain('>= $4::int');
    expect(params).toEqual(['AXEL2026', 500, ['active', 'past_due'], 20]);
  });

  it('defaults to everybody (day 0) and never a negative day', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await listCohortMembers('AXEL2026');
    await listCohortMembers('AXEL2026', -5);

    expect((mockQuery.mock.calls[0][1] as unknown[])[3]).toBe(0);
    expect((mockQuery.mock.calls[1][1] as unknown[])[3]).toBe(0);
  });
});
