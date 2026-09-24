import { readFileSync } from 'fs';
import { join } from 'path';
import { launchWindowStatus } from '../inviteCohorts.service';

/**
 * TWO PROMISES OF TWENTY DAYS, AND THEY AGREE ONLY BY COINCIDENCE.
 *
 *   * a LAUNCH-WINDOW invitee gets the cohort's `trial_days` — D137, twenty;
 *   * an ORDINARY invitee now gets the `invite_free_days` setting — also
 *     twenty, live since 24 September 16:07 UTC.
 *
 * Today those are the same number, so no test and no screen can tell them
 * apart. **The moment the founder lowers the setting to 10 or 5 — which he
 * said on 24 September he would — they diverge.** If the launch path is not
 * configured, somebody he invited personally then receives the lower number
 * instead of the twenty he promised, silently, with no error anywhere.
 *
 * ⚠️ AND IT MAY WELL NOT BE CONFIGURED. Measured on the live base that day:
 *
 *     accounts ever granted a cohort trial      0
 *     rows in invite_cohorts                    0
 *
 * „The launch path fires" has never once been observed. The answer lives in
 * `LAUNCH_TRIAL_REFERRER_IDS`, which meant asking somebody with the deployment
 * settings open — so it is now a read anybody can do.
 */
const SOURCE = readFileSync(join(__dirname, '..', 'inviteCohorts.service.ts'), 'utf8');

const REFERRERS = process.env.LAUNCH_TRIAL_REFERRER_IDS;

afterEach(() => {
  if (REFERRERS === undefined) delete process.env.LAUNCH_TRIAL_REFERRER_IDS;
  else process.env.LAUNCH_TRIAL_REFERRER_IDS = REFERRERS;
});

describe('whether the launch window exists at all', () => {
  it('is false when nobody is named, which means it admits and grants nothing', () => {
    delete process.env.LAUNCH_TRIAL_REFERRER_IDS;

    const status = launchWindowStatus();

    expect(status.configured).toBe(false);
    expect(status.referrer_count).toBe(0);
  });

  it('counts the accounts named', () => {
    process.env.LAUNCH_TRIAL_REFERRER_IDS = '501, 167250 ,171870';

    const status = launchWindowStatus();

    expect(status.configured).toBe(true);
    expect(status.referrer_count).toBe(3);
  });

  /**
   * ⚠️ THE IDS ARE THE FOUNDER'S OWN ACCOUNTS AND NEVER LEAVE. A count and the
   * dates answer „does this path fire" without naming anybody — the same rule
   * as everywhere else: a document for a person names people by name, and a
   * diagnostic names nobody at all when it does not have to.
   */
  it('never returns who they are', () => {
    process.env.LAUNCH_TRIAL_REFERRER_IDS = '501,167250';

    const printed = JSON.stringify(launchWindowStatus());

    expect(printed).not.toContain('501');
    expect(printed).not.toContain('167250');
  });

  /**
   * „Configured" and „open today" are different facts and the reading that
   * merges them is the one that misleads: a window that has closed still has
   * its referrers, and a window inside its dates still grants nothing if
   * nobody is named.
   */
  it('separates being configured from being open today', () => {
    expect(SOURCE).toContain('configured: ids.size > 0');
    expect(SOURCE).toContain('open_today: withinLaunchWindow(now)');
  });
});

describe('the number it would grant', () => {
  it('falls back to twenty rather than to nothing', () => {
    delete process.env.LAUNCH_TRIAL_DAYS;

    expect(launchWindowStatus().trial_days).toBe(20);
  });

  /**
   * This is the value to compare against `invite_free_days` once the founder
   * lowers it. Equal today; the whole point of exposing it is to see the day
   * they stop being equal.
   */
  it('reports what is set, when something is', () => {
    const before = process.env.LAUNCH_TRIAL_DAYS;
    process.env.LAUNCH_TRIAL_DAYS = '10';

    expect(launchWindowStatus().trial_days).toBe(10);

    if (before === undefined) delete process.env.LAUNCH_TRIAL_DAYS;
    else process.env.LAUNCH_TRIAL_DAYS = before;
  });
});
