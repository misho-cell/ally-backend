import { query } from '../../db/postgres/client';
import { getContactInsight } from '../insights.service';
import { getVisibleFacts, VisibleFact, VisibleFactsResult } from '../contactFacts.service';
import { MemberOwnWork, memberOwnWork } from '../memberCard.service';
import {
  AccountState,
  AccountDetails,
  accountDetailsFor,
  fetchAccountStates,
  isMemberPhone,
  isSubscriberPhone,
  accountStateFor,
} from './membership';
import { LikelyEmployer, likelyEmployerFor } from './likelyEmployer';
import { OwnContactView, ownContactOnTheCard } from './ownContactByNumber';

interface TagSummary {
  tag: string;
  contributor_count: number;
  total_weight: number;
}

interface ContactFullProfile extends LikelyEmployer, Partial<OwnContactView> {
  phone: string;
  // Whether this contact is a registered Ally member — steers intro vs. invite.
  is_member: boolean;
  account_state: AccountState;
  /** Pays for Netai today (Ticket 10 Task 9). */
  netai_subscriber: boolean;
  tags: TagSummary[];
  /** Row 289: how many labels OTHER people saved — never their words. */
  others_labels_count: number;
  insights: Record<string, unknown> | null;
  facts_and_ask: VisibleFactsResult;
  /** #5941: a member's own work, as they told their own Netai; absent when they said nothing. */
  member_says_about_own_work?: MemberOwnWork;
  /** #5941 (68831): the owner's own notes about this person, newest first; absent when none. */
  you_told_me?: readonly string[];
}

const NOTE_FIELD = 'note';
const MAX_TOLD_NOTES = 5;

/**
 * #5941 (the tester's 68831, 0 of 3): the owner said „Dato is my lawyer,
 * helped me buy my flat in 2024, very trustworthy". In a new conversation
 * „who is Dato?" got the job and field, never the shared history or the
 * trust: the notes were saved, and sat among a dozen facts in facts_and_ask.
 * The owner's own notes stand on their own; a shorter note already inside a
 * longer one („ძალიან სანდო" in „ძალიან სანდოა, 2024 წელს…") is left out.
 */
export function whatYouToldMe(facts: readonly VisibleFact[]): string[] {
  const notes = facts
    .filter((f) => f.field_type === NOTE_FIELD && f.first_saved !== undefined)
    .map((f) => f.value.trim())
    .filter((v) => v !== '');
  const unique = [...new Set(notes)];
  const kept = unique.filter(
    (note) =>
      !unique.some((other) => other !== note && other.toLowerCase().includes(note.toLowerCase())),
  );
  return kept.slice(0, MAX_TOLD_NOTES);
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

/**
 * ROW 289 — D539 („only my own labels") and D523 (never show how another
 * person saved a contact), the tester's 941: the contact card shows the labels
 * the owner saved, and of everyone else's only how many there are.
 */
export function ownLabelsOnly(
  rows: ReadonlyArray<TagSummary & { own: boolean }>,
): Pick<ContactFullProfile, 'tags' | 'others_labels_count'> {
  const shown = rows.filter((r) => isDisplayableTag(r.tag));
  return {
    tags: shown
      .filter((r) => r.own === true)
      .map(({ tag, contributor_count, total_weight }) => ({
        tag,
        contributor_count,
        total_weight,
      })),
    others_labels_count: shown.filter((r) => r.own !== true).length,
  };
}

function saysAnything(work: MemberOwnWork): boolean {
  return work.role !== null || work.company !== null || work.city !== null || work.areas.length > 0;
}

/** The member's own work for the card; a failed read leaves the card as it was. */
async function ownWorkFor(
  accountStates: Map<string, AccountDetails>,
  phone: string,
): Promise<Pick<ContactFullProfile, 'member_says_about_own_work'>> {
  const details = accountDetailsFor(accountStates, phone);
  if (details.state !== 'netai_user' || details.user_id === null) return {};
  try {
    const work = await memberOwnWork(details.user_id);
    return work !== null && saysAnything(work) ? { member_says_about_own_work: work } : {};
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[contact-profile] member work unavailable:', (err as Error).message);
    return {};
  }
}

function toldNotes(facts: readonly VisibleFact[]): Pick<ContactFullProfile, 'you_told_me'> {
  const told = whatYouToldMe(facts);
  return told.length === 0 ? {} : { you_told_me: told };
}

export async function getContactFullProfile(
  userId: string,
  phone: string,
  neo4jContactId?: string,
  askedName?: string,
): Promise<ContactFullProfile> {
  const lookupId = neo4jContactId ?? phone;

  const [tagsResult, factsAndAsk, likelyEmployer, ownContact] = await Promise.all([
    query<TagSummary & { own: boolean }>(
      `SELECT
         ut.tag,
         COUNT(DISTINCT ut."contactId")::int AS contributor_count,
         SUM(ut."weightCount")::int           AS total_weight,
         BOOL_OR(ut."contactId" = $2)         AS own
       FROM "UserTags" ut
       WHERE ut.phone = $1
       GROUP BY ut.tag
       ORDER BY COUNT(DISTINCT ut."contactId") DESC, SUM(ut."weightCount") DESC
       LIMIT 50`,
      [phone, userId],
    ),
    getVisibleFacts(userId, lookupId),
    likelyEmployerFor(userId, phone),
    // 5908: the names the network knows this own contact by.
    ownContactOnTheCard(userId, phone, askedName),
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
  const ownWork = await ownWorkFor(accountStates, phone);

  return {
    phone,
    is_member: isMemberPhone(accountStates, phone),
    account_state: accountStateFor(accountStates, phone),
    netai_subscriber: isSubscriberPhone(accountStates, phone),
    ...ownLabelsOnly(tagsResult.rows),
    insights: insightData,
    facts_and_ask: factsAndAsk,
    ...likelyEmployer,
    ...ownContact,
    ...ownWork,
    ...toldNotes(factsAndAsk.facts),
  };
}
