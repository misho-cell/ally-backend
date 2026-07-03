import { query } from '../../db/postgres/client';
import { getContactInsight } from '../insights.service';
import { getVisibleFacts, VisibleFactsResult } from '../contactFacts.service';

interface TagSummary {
  tag: string;
  contributor_count: number;
  total_weight: number;
}

interface ContactFullProfile {
  phone: string;
  tags: TagSummary[];
  insights: Record<string, unknown> | null;
  facts_and_ask: VisibleFactsResult;
}

const NUMERIC_ONLY_RE = /^\d+$/;
const HAS_LETTER_RE = /\p{L}/u;

export function isDisplayableTag(tag: string): boolean {
  return tag.length >= 2 && !NUMERIC_ONLY_RE.test(tag) && HAS_LETTER_RE.test(tag);
}

export async function getContactFullProfile(
  userId: string,
  phone: string,
  neo4jContactId?: string,
): Promise<ContactFullProfile> {
  const lookupId = neo4jContactId ?? phone;

  const [tagsResult, factsAndAsk] = await Promise.all([
    query<{ tag: string; contributor_count: number; total_weight: number }>(
      `SELECT
         ut.tag,
         COUNT(DISTINCT ut."contactId")::int AS contributor_count,
         SUM(ut."weightCount")::int           AS total_weight
       FROM "UserTags" ut
       WHERE ut.phone = $1
       GROUP BY ut.tag
       ORDER BY COUNT(DISTINCT ut."contactId") DESC, SUM(ut."weightCount") DESC
       LIMIT 50`,
      [phone],
    ),
    getVisibleFacts(userId, lookupId),
  ]);

  let insightData: Record<string, unknown> | null = null;
  try {
    const insight = await getContactInsight(userId, lookupId);
    insightData = insight?.data ?? null;
  } catch {
    // contact_insights.user_id column type mismatch — insight unavailable
  }

  return {
    phone,
    tags: tagsResult.rows.filter((r) => isDisplayableTag(r.tag)),
    insights: insightData,
    facts_and_ask: factsAndAsk,
  };
}
