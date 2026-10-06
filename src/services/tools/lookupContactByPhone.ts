import { query } from '../../db/postgres/client';
import { searchDidNotFinish } from './searchDidNotFinish';

const LOOKUP_TIMEOUT_MS = 5_000;

/**
 * #1918 (phone report point 47): the alias joined here was ANY owner's label
 * for the number, so the owner could be told her own contact's name the way
 * somebody else saved them. Only the searcher's own label is read now; the
 * registered name stands in when she saved the number without one.
 */
export async function lookupContactByPhone(userId: string, phoneNumber: string): Promise<object> {
  try {
    // Normalize: keep + and digits only, try both with and without country code
    const normalized = phoneNumber.replace(/[^\d+]/g, '');
    const digitsOnly = phoneNumber.replace(/\D/g, '');

    const result = await query<{
      name: string | null;
      alias: string | null;
      phone: string;
      email: string | null;
      city: string | null;
      jobPosition: string | null;
      employer: string | null;
      subscriptionStatus: string | null;
    }>(
      `SELECT
         u.name        AS name,
         ua.alias      AS alias,
         up.phone      AS phone,
         u.email       AS email,
         u.city        AS city,
         u."jobPosition" AS "jobPosition",
         u.employer    AS employer,
         u.subscription_status AS "subscriptionStatus"
       FROM "UserPhone" up
       LEFT JOIN "User" u   ON u.id = up."userId"
       LEFT JOIN LATERAL (
         SELECT own.alias
           FROM "UserAlias" own
          WHERE own.phone = up.phone
            AND own."contactId" = $4::int
            AND NULLIF(TRIM(own.alias), '') IS NOT NULL
          ORDER BY LENGTH(TRIM(own.alias)) DESC, own.alias
          LIMIT 1
       ) ua ON TRUE
       WHERE up.phone = $1
          OR up.phone = $2
          OR up."phoneNumber" = $3
       LIMIT 1`,
      [normalized, '+' + digitsOnly, digitsOnly, userId],
      LOOKUP_TIMEOUT_MS,
    );

    if (result.rows.length === 0) {
      return { found: false, phone: phoneNumber };
    }

    const row = result.rows[0];
    return {
      found: true,
      name: row.alias?.trim() || row.name?.trim() || null,
      city: row.city ?? null,
      jobPosition: row.jobPosition ?? null,
      employer: row.employer ?? null,
      hasSubscription: row.subscriptionStatus === 'active' || row.subscriptionStatus === 'trialing',
    };
  } catch (err) {
    console.error('lookupContactByPhone error:', (err as Error).message);
    // A search that could not run is not an empty network — see searchDidNotFinish.
    return searchDidNotFinish('The contact lookup', err);
  }
}
