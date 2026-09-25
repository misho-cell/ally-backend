import { query } from '../../db/postgres/client';
import { getContactInsight } from '../insights.service';
import { getVisibleFacts, VisibleFactsResult } from '../contactFacts.service';
import {
  AccountState,
  fetchAccountStates,
  isMemberPhone,
  isSubscriberPhone,
  accountStateFor,
} from './membership';

interface TagSummary {
  tag: string;
  contributor_count: number;
  total_weight: number;
}

interface ContactFullProfile {
  phone: string;
  // Whether this contact is a registered Ally member — steers intro vs. invite.
  is_member: boolean;
  account_state: AccountState;
  /** Pays for Netai today (Ticket 10 Task 9). */
  netai_subscriber: boolean;
  tags: TagSummary[];
  insights: Record<string, unknown> | null;
  facts_and_ask: VisibleFactsResult;
}

const NUMERIC_ONLY_RE = /^\d+$/;
const HAS_LETTER_RE = /\p{L}/u;
/**
 * ⚠️ AN EMAIL ADDRESS IS NOT A LABEL ABOUT A PERSON — the tester, 25 September,
 * the leftover after the name fix.
 *
 * The connector search stopped SHOWING „[email hidden] L" as somebody's name,
 * and their tag list still carried „[email hidden]" — the scrubber's output
 * over a tag whose stored value is a real email address, contributed by
 * somebody about that person. Nobody reads it as a name any more, but the
 * model still sees it among the words that are supposed to describe who
 * somebody is.
 *
 * Same rule as the name, one surface along: an email says how to reach a
 * person, never what they are. A tag list is for „lawyer", „Arci", „Tbilisi".
 */
const LOOKS_LIKE_EMAIL_RE = /\S+@\S+/;

export function isDisplayableTag(tag: string): boolean {
  return (
    tag.length >= 2 &&
    !NUMERIC_ONLY_RE.test(tag) &&
    HAS_LETTER_RE.test(tag) &&
    !LOOKS_LIKE_EMAIL_RE.test(tag)
  );
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
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error('[contact-profile] insight unavailable:', (err as Error).message);
    // known cause: the contact_insights.user_id column type mismatch
  }

  const accountStates = await fetchAccountStates([phone]);

  return {
    phone,
    is_member: isMemberPhone(accountStates, phone),
    account_state: accountStateFor(accountStates, phone),
    netai_subscriber: isSubscriberPhone(accountStates, phone),
    tags: tagsResult.rows.filter((r) => isDisplayableTag(r.tag)),
    insights: insightData,
    facts_and_ask: factsAndAsk,
  };
}
