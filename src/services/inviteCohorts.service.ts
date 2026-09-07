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

/** The active cohort behind a code, or null when the code is not a cohort's. */
export async function findCohortByCode(code: string): Promise<InviteCohort | null> {
  const normalized = normalizeCohortCode(code);
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
  return result.rows.map((r) => ({ ...r, registered: Number(r.registered) }));
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
}

const COHORT_MEMBERS_LIMIT = 500;

export async function listCohortMembers(code: string): Promise<CohortMember[]> {
  const result = await query<{
    user_id: number;
    name: string | null;
    registered_at: string;
    day: string;
    subscription_status: string | null;
    trial_ends_at: string | null;
    threads: string;
  }>(
    `SELECT u.id AS user_id, u.name, u."createdAt" AS registered_at,
            (NOW()::date - u."createdAt"::date) AS day,
            u.subscription_status, u.trial_ends_at,
            (SELECT COUNT(*) FROM threads t WHERE t.user_id = u.id) AS threads
     FROM "User" u
     WHERE u.invite_cohort = $1 AND u."deletedAt" IS NULL
     ORDER BY u."createdAt" ASC
     LIMIT $2`,
    [normalizeCohortCode(code), COHORT_MEMBERS_LIMIT],
    COHORT_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    ...r,
    day: Number(r.day),
    threads: Number(r.threads),
  }));
}
