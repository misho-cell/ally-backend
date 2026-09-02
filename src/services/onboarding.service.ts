// Onboarding mode detection — deterministic, per the prompt team's rule:
// onboarding ENDS at the first completed import or after the account's first
// N days, whichever comes first. Never a permanent state; the mode only
// shapes the conversation (the block's job) — a real question still gets a
// real answer.

import { query } from '../db/postgres/client';
import { intEnv } from '../config/runBudgets';
import { getUserProfile, setUserProfileField } from './userProfile.service';

const ONBOARDING_CHECK_TIMEOUT_MS = 3_000;

/** Days after signup during which a user with no import counts as onboarding. */
export const ONBOARDING_WINDOW_DAYS = intEnv('ONBOARDING_WINDOW_DAYS', 7);

export async function isOnboardingUser(userId: string): Promise<boolean> {
  try {
    const result = await query<{ young: boolean; has_import: boolean }>(
      `SELECT (u."createdAt" > NOW() - ($2 || ' days')::interval) AS young,
              EXISTS (SELECT 1 FROM "UserAlias" WHERE "contactId" = $1) AS has_import
       FROM "User" u
       WHERE u.id = $1`,
      [userId, ONBOARDING_WINDOW_DAYS],
      ONBOARDING_CHECK_TIMEOUT_MS,
    );
    const row = result.rows[0];
    return row != null && row.young && !row.has_import;
  } catch (err) {
    // Fail-safe: a broken onboarding check must never distort a normal run —
    // the user just gets the regular quick_answer treatment.
    // eslint-disable-next-line no-console
    console.error('[onboarding] check failed — treating as regular:', (err as Error).message);
    return false;
  }
}

/** The key a deliberate "skip the import" choice is stored under. */
export const ONBOARDING_SKIPPED_KEY = 'onboarding_contacts_skipped_at';

export interface OnboardingStatus {
  /** The server's OWN answer — the same rule that picks the prompt mode. */
  is_onboarding: boolean;
  contacts_imported: boolean;
  contacts_count: number;
  account_age_days: number;
  window_days: number;
  /** ISO timestamp if the person deliberately skipped the import, else null. */
  skipped_at: string | null;
}

/**
 * Onboarding state as the SERVER sees it, so the client stops inferring it.
 *
 * The frontend asked whether "has at least one thread" is a fair proxy for
 * "finished onboarding". It is not, in both directions: someone who imported
 * their contacts but never opened a chat has no thread, and someone who
 * chatted but skipped the import has one while the server still treats them
 * as onboarding and serves them onboarding prompts. Two different answers on
 * the two sides is how a refresh loses the screen. This returns the one the
 * server actually acts on.
 */
export async function getOnboardingStatus(userId: string): Promise<OnboardingStatus> {
  const result = await query<{ age_days: number; contacts: string }>(
    `SELECT EXTRACT(DAY FROM NOW() - u."createdAt")::int AS age_days,
            (SELECT COUNT(*) FROM "UserAlias" WHERE "contactId" = $1) AS contacts
     FROM "User" u
     WHERE u.id = $1 AND u."deletedAt" IS NULL`,
    [userId],
    ONBOARDING_CHECK_TIMEOUT_MS,
  );
  const row = result.rows[0];
  const contactsCount = Number(row?.contacts ?? 0);
  const ageDays = Number(row?.age_days ?? 0);
  const profile = await getUserProfile(userId);
  return {
    is_onboarding: row != null && ageDays < ONBOARDING_WINDOW_DAYS && contactsCount === 0,
    contacts_imported: contactsCount > 0,
    contacts_count: contactsCount,
    account_age_days: ageDays,
    window_days: ONBOARDING_WINDOW_DAYS,
    skipped_at: profile[ONBOARDING_SKIPPED_KEY] ?? null,
  };
}

/**
 * Record that the person chose to skip the contact import. Nothing recorded
 * this before, so "hasn't done it yet" and "decided not to" were the same
 * state on every device — and a re-prompt looked like the app forgetting.
 * Idempotent: the FIRST skip keeps its timestamp.
 */
export async function markOnboardingSkipped(userId: string): Promise<OnboardingStatus> {
  const existing = await getUserProfile(userId);
  if (existing[ONBOARDING_SKIPPED_KEY] === undefined) {
    await setUserProfileField(userId, ONBOARDING_SKIPPED_KEY, new Date().toISOString());
  }
  return getOnboardingStatus(userId);
}
