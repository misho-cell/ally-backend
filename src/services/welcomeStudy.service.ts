import { query } from '../db/postgres/client';
import { savePrivateContext } from './userPrivateContext.service';
import { webSearch } from './tools/webSearch';
import { LabelCount, nameToResearch } from './researchName';
import { normalizePhone, phoneDigits } from './phone';
import { identityWords } from './registrationResearch/identity';
import { nameKey } from './tools/transliterate';

// UserAlias/UserConnectionPhone predate phone normalization and store every
// spelling a phone import ever produced ('+995…', '995…', '599…', '0599…').
// A regexp_replace scan against either table means the planner can't use
// their phone index at all — on UserAlias (8M+ rows) that's an index scan
// ordered by ALIAS instead, checked live via EXPLAIN: cost ~612,000 versus
// ~23 for an equality check across these variants. This IS the founder's
// own MIN_SUBSCRIBED_OWNERS-style phone matching used elsewhere
// (inviteGate.service.ts's phoneVariants) — duplicated locally since that
// one isn't exported, for a single-caller helper this small.
const GEORGIA_CC = '995';
const GEORGIA_LOCAL_LEN = 9;

function phoneVariants(phone: string): string[] {
  const variants = new Set<string>([phone.trim()]);
  const digits = phoneDigits(phone);
  if (digits) {
    variants.add(normalizePhone(phone));
    variants.add(digits);
    if (digits.startsWith(GEORGIA_CC) && digits.length === GEORGIA_CC.length + GEORGIA_LOCAL_LEN) {
      const local = digits.slice(GEORGIA_CC.length);
      variants.add(local);
      variants.add(`0${local}`);
    }
  }
  variants.delete('');
  return [...variants];
}

// Engine T13 (ticket 6, 20 Aug spec): on registration, gather a starter
// profile of the new user from what's already known about their phone
// number — before they've typed a single message — so the first session
// isn't a blank slate. Boundary, enforced by what this deliberately does
// NOT query: other users' contact_facts (their private notes about this
// person) are never touched. Only labels/tags (fair game per spec), the
// old-Ally hand-sort, and public web results.
const STUDY_TIMEOUT_MS = 10_000;
const MAX_LABELS = 15;
const WELCOME_STUDY_KEY = 'welcome_study';

async function gatherLabels(variants: string[]): Promise<string[]> {
  const [aliases, tags] = await Promise.all([
    query<{ alias: string }>(
      `SELECT DISTINCT alias FROM "UserAlias" WHERE phone = ANY($1) LIMIT $2`,
      [variants, MAX_LABELS],
      STUDY_TIMEOUT_MS,
    ),
    query<{ tag: string }>(
      `SELECT DISTINCT tag FROM "UserTags" WHERE phone = ANY($1) LIMIT $2`,
      [variants, MAX_LABELS],
      STUDY_TIMEOUT_MS,
    ),
  ]);
  return [...new Set([...aliases.rows.map((r) => r.alias), ...tags.rows.map((r) => r.tag)])];
}

/** How many people saved this number under each label — the research name is the most common whole one. */
async function gatherLabelCounts(variants: string[]): Promise<LabelCount[]> {
  const result = await query<{ alias: string; count: string }>(
    `SELECT TRIM(alias) AS alias, COUNT(DISTINCT "contactId") AS count
       FROM "UserAlias"
      WHERE phone = ANY($1) AND NULLIF(TRIM(alias), '') IS NOT NULL
      GROUP BY TRIM(alias)
      ORDER BY count DESC
      LIMIT $2`,
    [variants, MAX_LABELS],
    STUDY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({ label: r.alias, count: Number(r.count) }));
}

// The legacy colour sort (RelationshipStatus), aggregated across EVERYONE who
// ever hand-sorted this phone number — not scoped to one viewer, unlike
// getOldAllyStatuses (which reads it from one user's own perspective).
async function gatherOldAllyStanding(variants: string[]): Promise<Record<string, number>> {
  const result = await query<{ status: string; count: string }>(
    `SELECT uc."relationshipStatus" AS status, COUNT(*) AS count
     FROM "UserConnectionPhone" ucp
     JOIN "UserConnection" uc ON uc.id = ucp."connectionId"
     WHERE ucp.phone = ANY($1)
       AND uc."relationshipStatus" IS NOT NULL
       AND COALESCE(uc."isIgnored", false) = false
     GROUP BY uc."relationshipStatus"`,
    [variants],
    STUDY_TIMEOUT_MS,
  );
  const out: Record<string, number> = {};
  for (const row of result.rows) out[row.status] = Number(row.count);
  return out;
}

interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * #7726 (tester 76702): the study kept whatever the web returned for the name
 * — a US economics professor, the Wikipedia page for „Giorgi". A result stays
 * only when it holds a word members saved about this person beyond the name
 * (an employer, a role); with no such word, no web result is kept.
 */
export function confirmedWebResults(
  results: readonly WebResult[],
  words: readonly string[],
): WebResult[] {
  if (words.length === 0) return [];
  return results.filter((r) => {
    const text = new Set(nameKey(`${r.title} ${r.snippet}`).split(' '));
    return words.some((w) => text.has(w));
  });
}

/**
 * Fire-and-forget, called once right after registration succeeds. Never
 * throws into the registration response — a failed study is a missed
 * head-start, never a reason to fail sign-up.
 */
export async function runWelcomeStudy(userId: string, name: string, phone: string): Promise<void> {
  if (!phoneDigits(phone)) return;
  const variants = phoneVariants(phone);
  try {
    const [labels, oldAlly, labelCounts] = await Promise.all([
      gatherLabels(variants),
      gatherOldAllyStanding(variants),
      gatherLabelCounts(variants),
    ]);
    const searched = nameToResearch(name, labelCounts);
    const web = searched === null ? {} : await webSearch(searched);

    const sections: string[] = [];
    if (labels.length > 0) {
      sections.push(`სხვები მას ასე იცნობენ საკუთარ ჩანაწერებში: ${labels.join(', ')}`);
    }
    const oldAllyEntries = Object.entries(oldAlly);
    if (oldAllyEntries.length > 0) {
      const summary = oldAllyEntries.map(([status, count]) => `${status}: ${count}`).join(', ');
      sections.push(`ძველი Ally-ს ხელით დახარისხებაში ის ასე ჩანს: ${summary}`);
    }
    const webResults = confirmedWebResults(
      (web as { results?: WebResult[] }).results ?? [],
      identityWords(
        labelCounts.map((c) => c.label),
        name,
      ),
    );
    if (webResults.length > 0) {
      const lines = webResults
        .slice(0, 3)
        .map((r) => `${r.title} (${r.url}): ${r.snippet}`)
        .join('\n');
      sections.push(`საჯარო წყაროებში მოიძებნა:\n${lines}`);
    }
    if (sections.length === 0) {
      // eslint-disable-next-line no-console
      console.log(`[welcome-study] user ${userId}: nothing found (labels/old-Ally/web all empty)`);
      return;
    }

    await savePrivateContext(
      userId,
      WELCOME_STUDY_KEY,
      `ახალი მომხმარებლის საწყისი პროფილი, რეგისტრაციისას შეგროვებული:\n\n${sections.join('\n\n')}`,
      'set',
    );
    // eslint-disable-next-line no-console
    console.log(
      `[welcome-study] user ${userId} done: ${labels.length} labels, ` +
        `${oldAllyEntries.length} old-Ally status(es), ${webResults.length} web result(s)`,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[welcome-study] user ${userId} failed:`, (err as Error).message);
  }
}

/** The heading the study writes its web section under; the section runs to the end of the note. */
const WEB_SECTION_HEADING = '\n\nსაჯარო წყაროებში მოიძებნა:';
const MAX_STRIP_USERS = 50;

export interface StrippedStudy {
  readonly user_id: number;
  /** The note as it stood before, so the strip can be undone by writing it back. */
  readonly before: string;
}

/** The note without its web section; the same text when there is none. */
export function withoutWebSection(note: string): string {
  const at = note.indexOf(WEB_SECTION_HEADING);
  return at < 0 ? note : note.slice(0, at);
}

/**
 * #7726 (tester 76702): studies written before the identity check still carry
 * namesakes. For the named accounts, the web section is taken out of the note;
 * labels and the old-Ally standing stay. Returns each note as it was.
 */
export async function stripWebFromStudies(
  userIds: readonly number[],
  dryRun: boolean,
): Promise<StrippedStudy[]> {
  // user_private_context.user_id is text: the ids are compared as text.
  const result = await query<{ user_id: string; value: string }>(
    `SELECT user_id, value FROM user_private_context
      WHERE key = $1 AND user_id = ANY($2::text[]) AND value LIKE '%' || $3 || '%'
      LIMIT $4`,
    [WELCOME_STUDY_KEY, userIds.map(String), WEB_SECTION_HEADING.trim(), MAX_STRIP_USERS],
    STUDY_TIMEOUT_MS,
  );
  if (!dryRun) {
    for (const row of result.rows) {
      await query(
        'UPDATE user_private_context SET value = $3, updated_at = NOW() WHERE user_id = $1 AND key = $2',
        [row.user_id, WELCOME_STUDY_KEY, withoutWebSection(row.value)],
        STUDY_TIMEOUT_MS,
      );
    }
  }
  return result.rows.map((r) => ({ user_id: Number(r.user_id), before: r.value }));
}
