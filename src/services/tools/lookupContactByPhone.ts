import { query } from '../../db/postgres/client';

export async function lookupContactByPhone(phoneNumber: string): Promise<object> {
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
       LEFT JOIN "UserAlias" ua ON ua.phone = up.phone
       WHERE up.phone = $1
          OR up.phone = $2
          OR up."phoneNumber" = $3
       LIMIT 1`,
      [normalized, '+' + digitsOnly, digitsOnly],
    );

    if (result.rows.length === 0) {
      return { found: false, phone: phoneNumber };
    }

    const row = result.rows[0];
    return {
      found: true,
      name: row.alias ?? row.name ?? null,
      city: row.city ?? null,
      jobPosition: row.jobPosition ?? null,
      employer: row.employer ?? null,
      hasSubscription: row.subscriptionStatus === 'active' || row.subscriptionStatus === 'trialing',
    };
  } catch (err) {
    console.error('lookupContactByPhone error:', (err as Error).message);
    return { found: false, error: (err as Error).message };
  }
}
