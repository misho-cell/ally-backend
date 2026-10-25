import { query } from '../../db/postgres/client';
import { notAnExcludedHolder } from '../excludedHolders.service';
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

export interface OthersLabel {
  readonly label: string;
  readonly saved_by: number;
}

/** Enough to read where somebody works now; a long tail of nicknames adds nothing. */
const MAX_OTHERS_LABELS = 10;

interface ContactFullProfile extends LikelyEmployer, Partial<OwnContactView> {
  phone: string;
  // Whether this contact is a registered Ally member — steers intro vs. invite.
  is_member: boolean;
  account_state: AccountState;
  /** Pays for Netai today (Ticket 10 Task 9). */
  netai_subscriber: boolean;
  tags: TagSummary[];
  /** Row 289: how many labels OTHER people saved. */
  others_labels_count: number;
  /**
   * Misho, 19 Oct (the tester's 68844): what other members saved this person
   * as, said WITHOUT who saved it — each label with how many saved it. Lifts
   * row 289's „never their words" (D523/D539) for the words; never the author.
   */
  others_saved_as: OthersLabel[];
  insights: Record<string, unknown> | null;
  facts_and_ask: VisibleFactsResult;
  /** #5941: a member's own work, as they told their own Netai; absent when they said nothing. */
  member_says_about_own_work?: MemberOwnWork;
  /** #5974 (68872): the owner's own contacts who also have this person saved, by the owner's names. */
  your_contacts_who_know_them?: readonly string[];
  /** #5974 (69079, 69126): when this person is a member, the owner's contacts they also have saved. */
  contacts_you_both_have?: readonly string[];
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
 *
 * Misho, 19 Oct: other members' labels ARE said, without the author. Three
 * friends had saved Giga as „TBC credit risk", „Bank of Georgia since 2025"
 * and „left TBC now at BoG"; „where does Giga work now?" got „nothing on his
 * record" 0 of 4. Each label goes with how many saved it, never with who.
 */
export function ownLabelsOnly(
  rows: ReadonlyArray<TagSummary & { own: boolean }>,
): Pick<ContactFullProfile, 'tags' | 'others_labels_count' | 'others_saved_as'> {
  const shown = rows.filter((r) => isDisplayableTag(r.tag));
  return {
    others_saved_as: shown
      .filter((r) => r.own !== true)
      .slice(0, MAX_OTHERS_LABELS)
      .map((r) => ({ label: r.tag, saved_by: r.contributor_count })),
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

const MUTUAL_QUERY_TIMEOUT_MS = 3_000;
const MAX_MUTUAL = 10;

/**
 * #5974 (the tester's 68872, 0 of 4): the owner has Nana, and two of his friends
 * have her too. „Which of my friends also know Nana?" got „none" — the second
 * circle leaves out anyone already in the owner's own book, so nothing said who
 * else holds her. The owner's own contacts (members) who have her saved, by the
 * names the OWNER gave them; never how they saved her. A failed read adds nothing.
 */
export async function contactsWhoKnowThem(
  userId: string,
  phone: string,
): Promise<Pick<ContactFullProfile, 'your_contacts_who_know_them'>> {
  try {
    const result = await query<{ name: string }>(
      `SELECT DISTINCT TRIM(own.alias) AS name
         FROM "UserAlias" theirs
         JOIN "UserPhone" up  ON up."userId" = theirs."contactId"
         JOIN "UserAlias" own ON own."contactId" = $1::int AND own.phone = up.phone
        WHERE theirs.phone = $2 AND theirs."contactId" <> $1::int
          AND NULLIF(TRIM(own.alias), '') IS NOT NULL
          -- Tester 75684 (Misho, 24 Oct): an account that never vouches knows nobody here.
          AND ${notAnExcludedHolder('theirs."contactId"')}
        LIMIT $3`,
      [userId, phone, MAX_MUTUAL],
      MUTUAL_QUERY_TIMEOUT_MS,
    );
    const names = result.rows.map((r) => r.name).filter((n) => HAS_LETTER_RE.test(n));
    return names.length === 0 ? {} : { your_contacts_who_know_them: names };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[contact-profile] mutual contacts not read:', (err as Error).message);
    return {};
  }
}

/**
 * #5974 (the tester's 69079 and 69126, 0 of 5): „who are Nika's and my mutual
 * acquaintances?" — Nika is a member and the two books share two people, but
 * nothing compared them: the run looked Nika up by name and answered „no mutual
 * acquaintance". When the person is a member, the owner's own contacts that
 * the member has saved too, by the names the OWNER gave them; never how the
 * member saved them. A failed read adds nothing.
 */
export async function contactsYouBothHave(
  userId: string,
  phone: string,
): Promise<Pick<ContactFullProfile, 'contacts_you_both_have'>> {
  try {
    const result = await query<{ name: string }>(
      `SELECT DISTINCT TRIM(own.alias) AS name
         FROM "UserPhone" up
         JOIN "UserAlias" theirs ON theirs."contactId" = up."userId"
         JOIN "UserAlias" own    ON own."contactId" = $1::int AND own.phone = theirs.phone
        WHERE up.phone = $2 AND up."userId" <> $1::int
          AND NULLIF(TRIM(own.alias), '') IS NOT NULL
          -- Tester 75684: nor is one of them a contact the two have in common.
          AND NOT EXISTS (SELECT 1 FROM "UserPhone" xp
                           JOIN excluded_holders eh ON eh.user_id = xp."userId"
                          WHERE xp.phone = theirs.phone)
        LIMIT $3`,
      [userId, phone, MAX_MUTUAL],
      MUTUAL_QUERY_TIMEOUT_MS,
    );
    const names = result.rows.map((r) => r.name).filter((n) => HAS_LETTER_RE.test(n));
    return names.length === 0 ? {} : { contacts_you_both_have: names };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[contact-profile] shared contacts not read:', (err as Error).message);
    return {};
  }
}

/**
 * #5974 (the tester's 68996, 1 of 6): „who do I know who knows Nana?" named both
 * friends only in the one run that opened her card; the others searched by name
 * and said nobody else was connected. A name search's first rows carry the
 * owner's own contacts who also know them, so it no longer depends on the card.
 */
const MUTUAL_ROWS_READ = 3;

export async function withContactsWhoKnowThem<T extends object>(
  userId: string,
  result: T,
): Promise<T> {
  const rows = (result as { results?: unknown }).results;
  if (!Array.isArray(rows) || rows.length === 0) return result;
  const read = await Promise.all(
    rows.slice(0, MUTUAL_ROWS_READ).map((row: unknown) => {
      const phone = (row as { phone?: unknown } | null)?.phone;
      return typeof phone === 'string' && phone !== ''
        ? Promise.all([
            contactsWhoKnowThem(userId, phone),
            contactsYouBothHave(userId, phone),
          ]).then(([knowThem, both]) => ({ ...knowThem, ...both }))
        : Promise.resolve({});
    }),
  );
  return {
    ...result,
    results: rows.map((row: unknown, i: number) =>
      i < read.length ? { ...(row as object), ...read[i] } : row,
    ),
  };
}

export async function getContactFullProfile(
  userId: string,
  phone: string,
  neo4jContactId?: string,
  askedName?: string,
): Promise<ContactFullProfile> {
  const lookupId = neo4jContactId ?? phone;

  const [tagsResult, factsAndAsk, likelyEmployer, ownContact, mutual, shared] = await Promise.all([
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
    contactsWhoKnowThem(userId, phone),
    contactsYouBothHave(userId, phone),
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
    ...mutual,
    ...shared,
  };
}
