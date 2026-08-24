import { query } from '../db/postgres/client';
import { savePrivateContext } from './userPrivateContext.service';
import { webSearch } from './tools/webSearch';
import { normalizePhone, phoneDigits } from './phone';

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
 * Fire-and-forget, called once right after registration succeeds. Never
 * throws into the registration response — a failed study is a missed
 * head-start, never a reason to fail sign-up.
 */
export async function runWelcomeStudy(userId: string, name: string, phone: string): Promise<void> {
  if (!phoneDigits(phone)) return;
  const variants = phoneVariants(phone);
  try {
    const [labels, oldAlly, web] = await Promise.all([
      gatherLabels(variants),
      gatherOldAllyStanding(variants),
      name.trim() ? webSearch(name.trim()) : Promise.resolve({}),
    ]);

    const sections: string[] = [];
    if (labels.length > 0) {
      sections.push(`სხვები მას ასე იცნობენ საკუთარ ჩანაწერებში: ${labels.join(', ')}`);
    }
    const oldAllyEntries = Object.entries(oldAlly);
    if (oldAllyEntries.length > 0) {
      const summary = oldAllyEntries.map(([status, count]) => `${status}: ${count}`).join(', ');
      sections.push(`ძველი Ally-ს ხელით დახარისხებაში ის ასე ჩანს: ${summary}`);
    }
    const webResults = (web as { results?: WebResult[] }).results ?? [];
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
