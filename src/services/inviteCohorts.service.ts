import { query } from '../db/postgres/client';
import { phoneDigits } from './phone';

/**
 * Invite cohorts — a registration door that carries its own free period.
 *
 * Ticket 10 Task 26 (N07, D125): the Axel launch cohort registers with 20
 * free days instead of the 5-day Stripe trial; the plans and prices show when
 * the period ends; every other code keeps 5.
 *
 * A cohort is a code the founder hands out, with the number of free days it
 * carries. Registering through it opens the account already `trialing`, no
 * card asked. Two consequences follow from the one-trial-per-person rule
 * (migration 104) and are enforced here, not left to the caller:
 *   - the phone is written into stripe_trial_consumed at the door, so the
 *     Stripe checkout on day 21 offers no second trial;
 *   - the account records which cohort it came through, so "everyone from the
 *     Axel evening" is a query and the day-20 / day-40 lists exist.
 *
 * Nothing here decides who may register: the invite gate does, and it asks
 * this module only "is this code a cohort, and what does it carry".
 */

const COHORT_QUERY_TIMEOUT_MS = 8_000;
/** The default trial everyone else gets — the cohort's number is the exception. */
export const DEFAULT_TRIAL_DAYS = Number(process.env.STRIPE_TRIAL_DAYS ?? 5);
const MAX_COHORT_TRIAL_DAYS = 90;
const MAX_CODE_CHARS = 32;
const MAX_NAME_CHARS = 120;
/** Marks the consumed-trial row as granted at the door, not by Stripe. */
const COHORT_TRIAL_MARKER = 'cohort:';

export interface InviteCohort {
  code: string;
  name: string;
  trial_days: number;
  tier: string;
  active: boolean;
  note: string | null;
  created_by: string;
  created_at: string;
}

export interface InviteCohortWithCount extends InviteCohort {
  /** Accounts that registered through this code. */
  registered: number;
}

/** Codes are compared case-insensitively and stored upper-case. */
export function normalizeCohortCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * The launch window (D137, 8 Sep): no new code. The 20 days attach to the
 * EXISTING invitations of the accounts the founder named, from launch day to
 * 15 October — everyone who registers through one of their referral codes or
 * links in the window gets the cohort's period, Axel member or not. Settings,
 * not code: LAUNCH_TRIAL_REFERRER_IDS (comma-separated user ids),
 * LAUNCH_TRIAL_DAYS (20), LAUNCH_TRIAL_STARTS_AT / LAUNCH_TRIAL_ENDS_AT (ISO).
 * The registrants are grouped under LAUNCH_COHORT_CODE, so the day-20 and
 * day-40 lists read from the same members route as any cohort.
 */
export const LAUNCH_COHORT_CODE = 'LAUNCH2026';
const DEFAULT_LAUNCH_TRIAL_DAYS = 20;

function launchReferrerIds(): ReadonlySet<string> {
  return new Set(
    (process.env.LAUNCH_TRIAL_REFERRER_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
}

function withinLaunchWindow(now: Date): boolean {
  const starts = process.env.LAUNCH_TRIAL_STARTS_AT;
  const ends = process.env.LAUNCH_TRIAL_ENDS_AT;
  if (starts && now < new Date(starts)) return false;
  if (ends && now > new Date(ends)) return false;
  return true;
}

/** Is a registration attributed to this inviter inside the launch window? */
export function launchCohortFor(
  inviterUserId: number | undefined,
  now = new Date(),
): InviteCohort | null {
  if (inviterUserId === undefined) return null;
  const ids = launchReferrerIds();
  if (ids.size === 0 || !ids.has(String(inviterUserId))) return null;
  if (!withinLaunchWindow(now)) return null;
  const days = Number(process.env.LAUNCH_TRIAL_DAYS ?? DEFAULT_LAUNCH_TRIAL_DAYS);
  return {
    code: LAUNCH_COHORT_CODE,
    name: 'Axel launch window (the founders’ own invitations)',
    trial_days: Number.isFinite(days) && days > 0 ? Math.floor(days) : DEFAULT_LAUNCH_TRIAL_DAYS,
    tier: 'pro',
    active: true,
    note: `referrers ${[...ids].join(', ')} · until ${process.env.LAUNCH_TRIAL_ENDS_AT ?? 'open'}`,
    created_by: 'founder (D137)',
    created_at: process.env.LAUNCH_TRIAL_STARTS_AT ?? '',
  };
}

/** The cohort row behind a code in ANY state — for the admin reads, not the door. */
export async function findCohortAnyState(code: string): Promise<InviteCohort | null> {
  const normalized = normalizeCohortCode(code);
  if (normalized === LAUNCH_COHORT_CODE) return launchCohortRow();
  if (normalized === '' || normalized.length > MAX_CODE_CHARS) return null;
  const result = await query<InviteCohort>(
    `SELECT code, name, trial_days, tier, active, note, created_by, created_at
     FROM invite_cohorts WHERE code = $1 LIMIT 1`,
    [normalized],
    COHORT_QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

/** The launch window as a cohort row for the list, whatever the date. */
function launchCohortRow(): InviteCohort | null {
  const ids = launchReferrerIds();
  if (ids.size === 0) return null;
  const days = Number(process.env.LAUNCH_TRIAL_DAYS ?? DEFAULT_LAUNCH_TRIAL_DAYS);
  return {
    code: LAUNCH_COHORT_CODE,
    name: 'Axel launch window (the founders’ own invitations)',
    trial_days: Number.isFinite(days) && days > 0 ? Math.floor(days) : DEFAULT_LAUNCH_TRIAL_DAYS,
    tier: 'pro',
    active: withinLaunchWindow(new Date()),
    note: `referrers ${[...ids].join(', ')} · until ${process.env.LAUNCH_TRIAL_ENDS_AT ?? 'open'}`,
    created_by: 'founder (D137)',
    created_at: process.env.LAUNCH_TRIAL_STARTS_AT ?? '',
  };
}

/** The active cohort behind a code, or null when the code is not a cohort's. */
export async function findCohortByCode(code: string): Promise<InviteCohort | null> {
  const normalized = normalizeCohortCode(code);
  // The launch cohort is not a door of its own: the code alone opens nothing,
  // only a founder's referral inside the window does (see the invite gate).
  if (normalized === LAUNCH_COHORT_CODE) return null;
  if (normalized === '' || normalized.length > MAX_CODE_CHARS) return null;
  const result = await query<InviteCohort>(
    `SELECT code, name, trial_days, tier, active, note, created_by, created_at
     FROM invite_cohorts WHERE code = $1 AND active = TRUE LIMIT 1`,
    [normalized],
    COHORT_QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

export interface CreateCohortInput {
  code: string;
  name: string;
  trial_days: number;
  tier?: string;
  note?: string | null;
}

export type CreateCohortOutcome =
  | { created: true; cohort: InviteCohort }
  | { created: false; error: string };

/** Open a cohort. Refuses a code that already exists rather than editing it. */
export async function createCohort(
  input: CreateCohortInput,
  createdBy: string,
): Promise<CreateCohortOutcome> {
  const code = normalizeCohortCode(input.code);
  const name = input.name.trim();
  const trialDays = Number(input.trial_days);
  if (code === '' || code.length > MAX_CODE_CHARS || !/^[A-Z0-9_-]+$/.test(code)) {
    return { created: false, error: 'code: letters, digits, - and _ only, up to 32 characters' };
  }
  if (name === '' || name.length > MAX_NAME_CHARS) {
    return { created: false, error: 'name is required' };
  }
  if (!Number.isInteger(trialDays) || trialDays < 1 || trialDays > MAX_COHORT_TRIAL_DAYS) {
    return {
      created: false,
      error: `trial_days must be a whole number from 1 to ${MAX_COHORT_TRIAL_DAYS}`,
    };
  }
  const tier = (input.tier ?? 'pro').trim() || 'pro';
  const result = await query<InviteCohort>(
    `INSERT INTO invite_cohorts (code, name, trial_days, tier, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (code) DO NOTHING
     RETURNING code, name, trial_days, tier, active, note, created_by, created_at`,
    [code, name, trialDays, tier, input.note?.trim() || null, createdBy],
    COHORT_QUERY_TIMEOUT_MS,
  );
  const cohort = result.rows[0];
  if (!cohort) return { created: false, error: `a cohort with code ${code} already exists` };
  return { created: true, cohort };
}

/** Every cohort, newest first, with how many accounts each one let in. */
export async function listCohorts(): Promise<InviteCohortWithCount[]> {
  const result = await query<InviteCohort & { registered: string }>(
    `SELECT c.code, c.name, c.trial_days, c.tier, c.active, c.note, c.created_by, c.created_at,
            (SELECT COUNT(*) FROM "User" u
              WHERE u.invite_cohort = c.code AND u."deletedAt" IS NULL) AS registered
     FROM invite_cohorts c
     ORDER BY c.created_at DESC`,
    [],
    COHORT_QUERY_TIMEOUT_MS,
  );
  const rows = result.rows.map((r) => ({ ...r, registered: Number(r.registered) }));
  const launch = launchCohortRow();
  if (launch === null) return rows;
  const registered = await query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM "User" u WHERE u.invite_cohort = $1 AND u."deletedAt" IS NULL`,
    [LAUNCH_COHORT_CODE],
    COHORT_QUERY_TIMEOUT_MS,
  );
  return [{ ...launch, registered: Number(registered.rows[0]?.n ?? 0) }, ...rows];
}

/**
 * Close a door. The accounts already through it keep their period — closing
 * a cohort stops new registrations, it takes nothing from anyone.
 */
export async function deactivateCohort(code: string): Promise<boolean> {
  const result = await query(
    `UPDATE invite_cohorts SET active = FALSE WHERE code = $1 AND active = TRUE`,
    [normalizeCohortCode(code)],
    COHORT_QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Open a fresh account with the cohort's free period, and spend the person's
 * one trial on it.
 *
 * The status stamp is set so the past_due grace logic (migration 119) and any
 * reader of "when did this status begin" see the door as the beginning.
 */
export async function grantCohortTrial(
  userId: number,
  phone: string,
  cohort: InviteCohort,
): Promise<void> {
  await query(
    `UPDATE "User"
     SET subscription_status = 'trialing',
         subscription_tier = $2,
         trial_ends_at = NOW() + make_interval(days => $3),
         current_period_ends_at = NULL,
         subscription_status_changed_at = NOW(),
         invite_cohort = $4,
         "updatedAt" = NOW()
     WHERE id = $1`,
    [userId, cohort.tier, cohort.trial_days, cohort.code],
    COHORT_QUERY_TIMEOUT_MS,
  );
  const digits = phoneDigits(phone);
  if (!digits) return;
  await query(
    `INSERT INTO stripe_trial_consumed (phone_digits, subscription_id) VALUES ($1, $2)
     ON CONFLICT (phone_digits) DO NOTHING`,
    [digits, `${COHORT_TRIAL_MARKER}${cohort.code}`],
    COHORT_QUERY_TIMEOUT_MS,
  );
}

/**
 * The people a cohort let in, for the founder's day-20 and day-40 calls
 * (D125): who registered when, what state they are in now, and how far into
 * the period they are. Names and ids only — never phone numbers.
 */
export interface CohortMember {
  user_id: number;
  name: string | null;
  registered_at: string;
  day: number;
  subscription_status: string | null;
  trial_ends_at: string | null;
  threads: number;
  /** Task 26 / 28: „who used what" — goals on which a question actually went out. */
  tasks_with_action: number;
  /** Other people's goals this person answered on. */
  asks_answered: number;
  /** „Who paid": a live subscription or a recorded payment (migration 125). */
  paid: boolean;
  last_active_at: string | null;
}

const COHORT_MEMBERS_LIMIT = 500;
const PAYING_STATUSES = ['active', 'past_due'];

/**
 * Optionally only the people at or past a given day — the founder's day-20
 * and day-40 lists are this read with `minDay` 20 and 40.
 */
export async function listCohortMembers(code: string, minDay = 0): Promise<CohortMember[]> {
  const result = await query<{
    user_id: number;
    name: string | null;
    registered_at: string;
    day: string;
    subscription_status: string | null;
    trial_ends_at: string | null;
    threads: string;
    tasks_with_action: string;
    asks_answered: string;
    paid: boolean;
    last_active_at: string | null;
  }>(
    `SELECT u.id AS user_id, u.name, u."createdAt" AS registered_at,
            (NOW()::date - u."createdAt"::date) AS day,
            u.subscription_status, u.trial_ends_at,
            (SELECT COUNT(*) FROM threads t WHERE t.user_id = u.id) AS threads,
            (SELECT COUNT(*) FROM tasks t WHERE t.user_id = u.id::text
               AND EXISTS (SELECT 1 FROM task_asks a WHERE a.task_id = t.id)) AS tasks_with_action,
            (SELECT COUNT(*) FROM task_asks a WHERE a.to_user_id = u.id AND a.status = 'answered')
              AS asks_answered,
            (u.subscription_status = ANY($3::text[])
              OR EXISTS (SELECT 1 FROM payment_events p WHERE p.user_id = u.id)) AS paid,
            (SELECT MAX(c.created_at) FROM conversations c
               WHERE c.user_id = u.id AND c.role = 'user') AS last_active_at
     FROM "User" u
     WHERE u.invite_cohort = $1 AND u."deletedAt" IS NULL
       AND (NOW()::date - u."createdAt"::date) >= $4::int
     ORDER BY u."createdAt" ASC
     LIMIT $2`,
    [normalizeCohortCode(code), COHORT_MEMBERS_LIMIT, PAYING_STATUSES, Math.max(0, minDay)],
    COHORT_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    ...r,
    day: Number(r.day),
    threads: Number(r.threads),
    tasks_with_action: Number(r.tasks_with_action),
    asks_answered: Number(r.asks_answered),
    paid: r.paid === true,
    last_active_at: r.last_active_at === null ? null : new Date(r.last_active_at).toISOString(),
  }));
}
