import pool from '../../db/postgres/client';
import { getSession } from '../../db/neo4j/client';
import { buildSearchTerms } from './transliterate';

export async function searchSecondDegree(userId: string, tagQuery: string): Promise<object> {
  try {
    const phoneResult = await pool.query<{ phone: string }>(
      'SELECT phone FROM "UserPhone" WHERE "userId" = $1 LIMIT 1',
      [userId],
    );

    if (phoneResult.rows.length === 0) {
      return { found: false, reason: 'user_phone_not_found' };
    }

    const userPhone = phoneResult.rows[0].phone;
    const terms = buildSearchTerms(tagQuery);

    const termConditions = terms
      .map(
        (_, i) =>
          `(toLower(tr.name) CONTAINS $term${i}
            OR toLower(tr.employer) CONTAINS $term${i}
            OR toLower(tr.jobPosition) CONTAINS $term${i})`,
      )
      .join(' OR ');

    const params: Record<string, string> = { userPhone };
    terms.forEach((t, i) => {
      params[`term${i}`] = t;
    });

    const session = getSession();
    try {
      const result = await session.run(
        `MATCH (me:AllyNode {phoneKey: $userPhone})-[myRel:CONTACT]->(friend:AllyNode)-[tr:CONTACT]->(target:AllyNode)
         WHERE target.phoneKey <> me.phoneKey
           AND (${termConditions})
         RETURN DISTINCT target.phoneKey AS phone,
                tr.name                 AS name,
                tr.employer             AS employer,
                tr.jobPosition          AS jobPosition,
                myRel.name              AS via_name
         LIMIT 20`,
        params,
        { timeout: 10000 },
      );

      if (result.records.length === 0) {
        return { found: false, reason: 'no_matches' };
      }

      return {
        found: true,
        count: result.records.length,
        results: result.records.map((r) => ({
          name: (r.get('name') as string | null) ?? null,
          employer: (r.get('employer') as string | null) ?? null,
          jobPosition: (r.get('jobPosition') as string | null) ?? null,
          tags: [],
          via: (r.get('via_name') as string | null) ?? null,
        })),
      };
    } finally {
      await session.close();
    }
  } catch (err) {
    console.error('searchSecondDegree error:', (err as Error).message);
    return { found: false, error: (err as Error).message };
  }
}
