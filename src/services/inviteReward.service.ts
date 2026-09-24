import { query } from '../db/postgres/client';
import { InviteCohort } from './inviteCohorts.service';

/**
 * THE FREE DAYS AN INVITATION CARRIES — a switch and a number, both set from
 * the dashboard.
 *
 * The founder, 24 September (D485): „it has to be switchable and at first we
 * will set it on 20 days (from dashboard) and then reduce those days to 10 or
 * five."
 *
 * ════════ WHY THIS EXISTS RATHER THAN THE COHORT PATH ════════
 *
 * Twenty free days were already written, twice — a cohort's `trial_days`
 * (D125) and the launch window (D137). Measured on 24 September:
 *
 *     accounts ever granted a cohort trial      0
 *     rows in invite_cohorts                    0
 *
 * NOT ONE, EVER. Both paths needed configuration nobody filled in: the cohort
 * path matches a code against an empty table, and the launch path reads an
 * environment list. So „invite-link joiners get no free days", which is how
 * row 229 is worded, was never a regression — it is a promise that has never
 * once been kept.
 *
 * This fires on the ordinary referral path instead, which is the one that
 * actually gets used, and it depends on no configuration that can silently be
 * absent: a missing row means OFF, which is the honest direction for a thing
 * that spends money.
 *
 * ════════ AND IT IS A MONEY CONTROL WEARING A SCREEN ════════
 *
 * Every point of `value` is free product given away to everybody who joins
 * from now on — and since the founder's other rule is that nobody joins
 * without an invitation, „everybody invited" is about to mean „everybody".
 * Registered as §35 of `ADMIN_WRITE_OPERATIONS.md`, and the route bounds it,
 * because a slip of a keyboard on a dashboard should not be able to give a
 * year away.
 */

/** The switch, in `app_flags` beside the others the dashboard already toggles. */
export const INVITE_FREE_DAYS_FLAG = 'invite_free_days_on';

/** The number, in `app_settings`. Seeded at 20 by migration 175. */
export const INVITE_FREE_DAYS_SETTING = 'invite_free_days';

/**
 * The ceiling the ROUTE enforces. Not a policy — a typo guard. The founder
 * said twenty falling to ten or five; ninety is far above anything he
 * described and far below „a year by accident".
 */
export const MAX_INVITE_FREE_DAYS = 90;

const SETTING_QUERY_TIMEOUT_MS = 8_000;

export async function readSetting(setting: string): Promise<number | null> {
  const result = await query<{ value: string }>(
    'SELECT value::text AS value FROM app_settings WHERE setting = $1 LIMIT 1',
    [setting],
    SETTING_QUERY_TIMEOUT_MS,
  );
  const raw = result.rows[0]?.value;
  if (raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function writeSetting(
  setting: string,
  value: number,
  updatedBy: string,
): Promise<number> {
  const result = await query<{ value: string }>(
    `INSERT INTO app_settings (setting, value, updated_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (setting) DO UPDATE
       SET value = $2, updated_by = $3, updated_at = NOW()
     RETURNING value::text AS value`,
    [setting, value, updatedBy],
    SETTING_QUERY_TIMEOUT_MS,
  );
  return Number(result.rows[0]?.value ?? value);
}

/**
 * How many free days this invitation carries, or null for none.
 *
 * Null in three cases, and they are deliberately indistinguishable to the
 * caller because all three mean „give nothing": the switch is off, the switch
 * row has never been written, or the number is zero or missing. **A grant that
 * fires because a row was absent is the failure mode worth designing against**
 * — this one stays silent instead.
 */
export async function inviteFreeDays(): Promise<number | null> {
  const flag = await query<{ enabled: boolean }>(
    'SELECT enabled FROM app_flags WHERE flag = $1 LIMIT 1',
    [INVITE_FREE_DAYS_FLAG],
    SETTING_QUERY_TIMEOUT_MS,
  );
  if (flag.rows[0]?.enabled !== true) return null;

  const days = await readSetting(INVITE_FREE_DAYS_SETTING);
  if (days === null || days <= 0) return null;
  return Math.min(Math.floor(days), MAX_INVITE_FREE_DAYS);
}

/**
 * The code these accounts are stamped with, so „who got free days from an
 * invitation" is a query and not an archaeology exercise. It is deliberately
 * NOT the launch code: those are the founder's own named invitations inside a
 * window (D137), these are anybody's referral from the day the switch goes on,
 * and merging them would make the day-20 list answer a question nobody asked.
 */
export const INVITE_FREE_DAYS_COHORT = 'INVITED';

/** The same tier the cohort path gives; a free period that is not `pro` is a different promise. */
const INVITE_FREE_DAYS_TIER = 'pro';

/**
 * The grant, shaped as a cohort so it goes through `grantCohortTrial` — the
 * one path that already spends the person's Stripe trial at the door
 * (migration 104) and stamps the account. A second way to hand out free time
 * would be a second way to get the trial accounting wrong.
 *
 * `active: false` is not a contradiction: nothing reads it here, and a reader
 * who finds this code in `invite_cohorts` should find nothing, because there
 * is no such row — this door is a setting, not a code somebody types.
 */
export function inviteFreeDaysCohort(days: number): InviteCohort {
  return {
    code: INVITE_FREE_DAYS_COHORT,
    name: 'Free days carried by an invitation',
    trial_days: days,
    tier: INVITE_FREE_DAYS_TIER,
    active: true,
    note: `${INVITE_FREE_DAYS_SETTING} = ${days} at the moment of registration`,
    created_by: 'founder (24 Sep, D485)',
    created_at: '',
  };
}
