import { query } from '../../db/postgres/client';
import { getSession } from '../../db/neo4j/client';

export interface ContactInfo {
  name: string | null;
  employer: string | null;
  jobPosition: string | null;
  city: string | null;
}

export async function getUserContactMap(userId: string): Promise<Map<string, ContactInfo>> {
  const phoneResult = await query<{ phone: string }>(
    'SELECT phone FROM "UserPhone" WHERE "userId" = $1 LIMIT 1',
    [userId],
  );

  if (!phoneResult.rowCount || phoneResult.rows.length === 0) {
    return new Map();
  }

  const userPhone = phoneResult.rows[0].phone;
  const session = getSession();

  try {
    const result = await session.run(
      `MATCH (me:PhoneNode {phone: $userPhone})-[r:CONTACT]->(contact:PhoneNode)
       RETURN contact.phone AS phone,
              r.name        AS name,
              r.employer    AS employer,
              r.jobPosition AS jobPosition,
              r.city        AS city`,
      { userPhone },
    );

    const map = new Map<string, ContactInfo>();
    for (const record of result.records) {
      map.set(record.get('phone') as string, {
        name: record.get('name') as string | null,
        employer: record.get('employer') as string | null,
        jobPosition: record.get('jobPosition') as string | null,
        city: record.get('city') as string | null,
      });
    }
    return map;
  } finally {
    await session.close();
  }
}
