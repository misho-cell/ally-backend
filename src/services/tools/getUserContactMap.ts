import { query } from '../../db/postgres/client';

export interface ContactInfo {
  name: string | null;
  employer: string | null;
  jobPosition: string | null;
  city: string | null;
}

export async function getUserContactMap(userId: string): Promise<Map<string, ContactInfo>> {
  const result = await query<{
    phone: string;
    name: string | null;
    employer: string | null;
    jobPosition: string | null;
    city: string | null;
  }>(
    `SELECT ua.phone,
            COALESCE(ua.alias, u.name) AS name,
            u.employer                 AS employer,
            u."jobPosition"            AS "jobPosition",
            u.city                     AS city
     FROM "UserAlias" ua
     LEFT JOIN "UserPhone" up ON up.phone = ua.phone
     LEFT JOIN "User"      u  ON u.id     = up."userId"
     WHERE ua."userId" = $1
       AND ua.phone IS NOT NULL`,
    [userId],
  );

  const map = new Map<string, ContactInfo>();
  for (const row of result.rows) {
    if (!map.has(row.phone)) {
      map.set(row.phone, {
        name: row.name,
        employer: row.employer,
        jobPosition: row.jobPosition,
        city: row.city,
      });
    }
  }
  return map;
}
