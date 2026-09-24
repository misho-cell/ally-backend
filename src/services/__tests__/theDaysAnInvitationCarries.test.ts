jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import {
  INVITE_FREE_DAYS_COHORT,
  INVITE_FREE_DAYS_FLAG,
  INVITE_FREE_DAYS_SETTING,
  MAX_INVITE_FREE_DAYS,
  inviteFreeDays,
  inviteFreeDaysCohort,
} from '../inviteReward.service';

/**
 * „IT HAS TO BE SWITCHABLE AND AT FIRST WE WILL SET IT ON 20 DAYS (FROM
 * DASHBOARD) AND THEN REDUCE THOSE DAYS TO 10 OR FIVE." — the founder, 24
 * September (D485).
 *
 * ⚠️ THE FACT THAT SHAPED EVERY TEST BELOW. Twenty free days were already
 * written twice — a cohort's `trial_days` (D125) and the launch window (D137)
 * — and measured on 24 September:
 *
 *     accounts ever granted a cohort trial      0
 *     rows in invite_cohorts                    0
 *
 * Neither has ever run. So there is no „it worked before" to lean on and no
 * production evidence that the path is sound; everything it does is asserted
 * here, and the first real proof is a fictional seat, not this file.
 *
 * It spends money on every registration from the moment it is switched on, so
 * the tests are written from the OFF side: what has to be true before a single
 * free day is handed out.
 */

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

interface World {
  /** Absent = the row was never written, which is not the same as `false`. */
  flag?: boolean;
  /** Absent = the setting row is missing. */
  days?: number | string;
}

function answer(world: World): void {
  mockQuery.mockImplementation((sql: string, params?: readonly unknown[]) => {
    if (sql.includes('app_flags')) {
      expect(params?.[0]).toBe(INVITE_FREE_DAYS_FLAG);
      return Promise.resolve(
        world.flag === undefined ? rows([]) : rows([{ enabled: world.flag }]),
      ) as ReturnType<typeof query>;
    }
    if (sql.includes('app_settings')) {
      expect(params?.[0]).toBe(INVITE_FREE_DAYS_SETTING);
      return Promise.resolve(
        world.days === undefined ? rows([]) : rows([{ value: String(world.days) }]),
      ) as ReturnType<typeof query>;
    }
    throw new Error(`unexpected query: ${sql}`);
  });
}

beforeEach(() => mockQuery.mockReset());

describe('nothing is given away unless somebody said so', () => {
  it('gives nothing when the switch has never been written', async () => {
    answer({ days: 20 });
    await expect(inviteFreeDays()).resolves.toBeNull();
  });

  it('gives nothing when the switch is off, even with a number sitting there', async () => {
    answer({ flag: false, days: 20 });
    await expect(inviteFreeDays()).resolves.toBeNull();
  });

  /**
   * The seeded row makes this unlikely, not impossible — a migration that ran
   * on one base and not another is how „unlikely" becomes Tuesday. A missing
   * number must not fall back to a default, because a default here is free
   * product handed out by a table that was never filled in.
   */
  it('gives nothing when the switch is on but the number is missing', async () => {
    answer({ flag: true });
    await expect(inviteFreeDays()).resolves.toBeNull();
  });

  it('gives nothing when the number is zero', async () => {
    answer({ flag: true, days: 0 });
    await expect(inviteFreeDays()).resolves.toBeNull();
  });

  it('gives nothing when the number is nonsense', async () => {
    answer({ flag: true, days: 'twenty' });
    await expect(inviteFreeDays()).resolves.toBeNull();
  });

  /** The flag is read FIRST, so an off switch costs one query and not two. */
  it('does not even look at the number when the switch is off', async () => {
    answer({ flag: false, days: 20 });
    await inviteFreeDays();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe('what it gives when it is on', () => {
  it('the number on the dashboard, which starts at twenty', async () => {
    answer({ flag: true, days: 20 });
    await expect(inviteFreeDays()).resolves.toBe(20);
  });

  /** „then reduce those days to 10 or five" — the same path, no deploy. */
  it('five, once somebody lowers it', async () => {
    answer({ flag: true, days: 5 });
    await expect(inviteFreeDays()).resolves.toBe(5);
  });

  /**
   * The route refuses anything above the ceiling rather than clamping it, so a
   * value beyond it can only arrive from a hand-written row. Here — after the
   * fact, with an account already open — refusing is the wrong direction, so
   * this one clamps: the person gets the most the product will ever give and
   * nobody gets a year by accident.
   */
  it('never more than the ceiling, however the row got written', async () => {
    answer({ flag: true, days: 3650 });
    await expect(inviteFreeDays()).resolves.toBe(MAX_INVITE_FREE_DAYS);
  });

  it('whole days only', async () => {
    answer({ flag: true, days: 20.9 });
    await expect(inviteFreeDays()).resolves.toBe(20);
  });
});

describe('the grant it hands to the one path that already exists', () => {
  const cohort = inviteFreeDaysCohort(20);

  /**
   * Reusing `grantCohortTrial` is the whole point: it is the only place that
   * spends the person's one Stripe trial at the door (migration 104). A second
   * way to give free time would be a second way to get that wrong, and the
   * symptom would be a free trial offered on top of a free period.
   */
  it('carries the days it was given', () => {
    expect(cohort.trial_days).toBe(20);
    expect(cohort.tier).toBe('pro');
  });

  it('stamps the account so „who got free days" is a query', () => {
    expect(cohort.code).toBe(INVITE_FREE_DAYS_COHORT);
  });

  /**
   * NOT the launch code. Those are the founder's own named invitations inside
   * a window (D137); these are anybody's referral from the day the switch goes
   * on. Sharing the stamp would make his day-20 list answer a different
   * question than the one he asks.
   */
  it('is not the launch cohort', () => {
    expect(cohort.code).not.toBe('LAUNCH2026');
  });

  it('records what the number was at the moment of registration', () => {
    expect(cohort.note).toContain('20');
    expect(inviteFreeDaysCohort(5).note).toContain('5');
  });
});

/**
 * The ordering invariant lives in `registerUser`'s helper and cannot be reached
 * from here without standing up the whole registration. It is asserted on the
 * source because getting it wrong is silent: both grants write the SAME
 * columns, so a second one after a cohort would overwrite a promised period
 * with the general one and nobody would see an error.
 */
describe('a cohort door and an invitation never both pay out', () => {
  const SOURCE = readFileSync(join(__dirname, '..', 'auth.service.ts'), 'utf8');
  const HELPER = SOURCE.slice(SOURCE.indexOf('async function grantWhateverFreePeriodIsOwed'));

  it('the cohort branch returns instead of falling through', () => {
    const cohortBranch = HELPER.slice(0, HELPER.indexOf('inviteFreeDays()'));

    expect(cohortBranch).toContain('await grantCohortTrial(userId, cleanPhone, cohort);');
    expect(cohortBranch).toContain('return;');
  });

  /**
   * Social proof is not an invitation. A phone already sitting in somebody's
   * contacts can register with NOBODY inviting it — about 465 of them on 24
   * September — and paying free days for that would hand the product to a door
   * the founder is in the middle of closing.
   */
  it('nothing is given when nobody invited them', () => {
    expect(HELPER).toContain('if (gate.inviterUserId === undefined) return;');
    expect(HELPER.indexOf('gate.inviterUserId === undefined')).toBeLessThan(
      HELPER.indexOf('inviteFreeDays()'),
    );
  });
});
