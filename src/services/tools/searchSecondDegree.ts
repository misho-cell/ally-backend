import { query } from '../../db/postgres/client';
import { getSession } from '../../db/neo4j/client';

interface SecondDegreeRecord {
  phone: string;
  via_phone: string;
  via_name: string | null;
  name: string | null;
  employer: string | null;
  jobPosition: string | null;
}

export async function searchSecondDegree(userId: string, tagQuery: string): Promise<object> {
  try {
    const phoneResult = await query<{ phone: string }>(
      'SELECT phone FROM "UserPhone" WHERE "userId" = $1 LIMIT 1',
      [userId],
    );

    if (!phoneResult.rowCount || phoneResult.rows.length === 0) {
      return { found: false, reason: 'user_phone_not_found' };
    }

    const userPhone = phoneResult.rows[0].phone;

    const session = getSession();
    let secondDegree: SecondDegreeRecord[] = [];

    try {
      const neo4jResult = await session.run(
        `MATCH (me:PhoneNode {phone: $userPhone})-[:CONTACT]->(friend:PhoneNode)-[tr:CONTACT]->(target:PhoneNode)
         WHERE target.phone <> $userPhone
           AND NOT (me)-[:CONTACT]->(target)
         RETURN target.phone                                        AS phone,
                friend.phone                                       AS via_phone,
                head([(me)-[r:CONTACT]->(friend) | r.name])        AS via_name,
                tr.name                                            AS name,
                tr.employer                                        AS employer,
                tr.jobPosition                                     AS jobPosition
         LIMIT 100`,
        { userPhone },
      );

      secondDegree = neo4jResult.records.map((r) => ({
        phone: r.get('phone') as string,
        via_phone: r.get('via_phone') as string,
        via_name: r.get('via_name') as string | null,
        name: r.get('name') as string | null,
        employer: r.get('employer') as string | null,
        jobPosition: r.get('jobPosition') as string | null,
      }));
    } finally {
      await session.close();
    }

    if (secondDegree.length === 0) {
      return { found: false, reason: 'no_second_degree_contacts' };
    }

    const phones = secondDegree.map((r) => r.phone);
    const searchTerm = '%' + tagQuery.toLowerCase() + '%';

    const tagResult = await query<{ phone: string; all_tags: string[] }>(
      `SELECT ut.phone, array_agg(DISTINCT ut.tag) AS all_tags
       FROM "UserTags" ut
       WHERE ut.phone = ANY($1) AND LOWER(ut.tag) LIKE $2
       GROUP BY ut.phone`,
      [phones, searchTerm],
    );

    const tagsMap = new Map(tagResult.rows.map((r) => [r.phone, r.all_tags.filter(Boolean)]));

    const neo4jMatches = secondDegree.filter((r) => {
      const q = tagQuery.toLowerCase();
      return (
        r.name?.toLowerCase().includes(q) ||
        r.employer?.toLowerCase().includes(q) ||
        r.jobPosition?.toLowerCase().includes(q)
      );
    });

    const allMatchPhones = new Set([...tagsMap.keys(), ...neo4jMatches.map((r) => r.phone)]);

    const seen = new Set<string>();
    const results = secondDegree
      .filter((r) => allMatchPhones.has(r.phone))
      .filter((r) => {
        if (seen.has(r.phone)) return false;
        seen.add(r.phone);
        return true;
      })
      .map((r) => ({
        name: r.name,
        employer: r.employer ?? null,
        jobPosition: r.jobPosition ?? null,
        tags: tagsMap.get(r.phone) ?? [],
        via: r.via_name ?? r.via_phone,
      }));

    if (results.length === 0) {
      return { found: false, reason: 'no_tag_matches' };
    }

    return { found: true, count: results.length, results };
  } catch (err) {
    console.error('searchSecondDegree error:', (err as Error).message);
    return { found: false, error: (err as Error).message };
  }
}
