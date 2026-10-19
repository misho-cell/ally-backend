import { query } from '../db/postgres/client';
import { queryTerms } from './askBoundary.service';
import { labelNamedIn, latinLabelNamedInGeorgian } from './namedLabel';
import { phoneDigits } from './phone';
import { getOpenTaskByThread } from './taskStore.service';
import { saveContactExclusion } from './tools/contactExclusions';

/**
 * #6358 (the tester's 68966): the owner said „not Gigi, he's abroad" and „not
 * Tea, we quarrelled". Both were dropped in that chat, and nothing was kept:
 * in a new chat on the same goal Gigi was offered again and Tea was put first.
 * The exclusion tool existed; the model called it five times in a week.
 *
 * So the server keeps it. A clause of the owner's own line that holds a
 * refusal word and names exactly one person of the goal's plan rules that
 * person out for this goal, with the owner's line as the reason. And a run on
 * the same subject leaves every ruled-out person out of its searches, the way
 * a person's own boundary is left out.
 *
 * A clause, not the line: „არა, გიგიმ უკვე მითხრა" („no, Gigi already told
 * me") is two clauses, and neither holds both the refusal and the name.
 */
const QUERY_TIMEOUT_MS = 5_000;
const MAX_REASON_CHARS = 300;
const MAX_EXCLUSIONS_READ = 200;
const CLAUSE_SPLIT_RE = /[,.;:!?\n—–]+/u;
const WORD_SPLIT_RE = /[^\p{L}\p{M}']+/u;
const REFUSAL_WORDS: ReadonlySet<string> = new Set([
  'not',
  'no',
  "don't",
  'dont',
  'never',
  'except',
  'არა',
  'ნუ',
  'გარდა',
  'не',
  'нет',
  'кроме',
  'без',
]);

export interface PlanCandidate {
  readonly phone: string;
  readonly labels: readonly string[];
}

function holdsRefusal(clause: string): boolean {
  return clause
    .toLowerCase()
    .split(WORD_SPLIT_RE)
    .some((word) => REFUSAL_WORDS.has(word));
}

function names(clause: string, candidate: PlanCandidate): boolean {
  return candidate.labels.some(
    (label) => labelNamedIn(clause, label) || latinLabelNamedInGeorgian(clause, label),
  );
}

/** The phones the owner's line rules out, one clause at a time. */
export function ruledOutIn(line: string, candidates: readonly PlanCandidate[]): string[] {
  const out = new Set<string>();
  for (const clause of line.split(CLAUSE_SPLIT_RE)) {
    if (!holdsRefusal(clause)) continue;
    const named = candidates.filter((candidate) => names(clause, candidate));
    if (named.length === 1) out.add(phoneDigits(named[0].phone));
  }
  return [...out];
}

interface PlanPeople {
  readonly people_to_involve?: ReadonlyArray<{ readonly name?: unknown; readonly phone?: unknown }>;
}

function planPeople(...plans: readonly unknown[]): Array<{ name: string; phone: string }> {
  return plans.flatMap((plan) =>
    ((plan as PlanPeople | null)?.people_to_involve ?? []).flatMap((p) =>
      typeof p.name === 'string' && typeof p.phone === 'string' && phoneDigits(p.phone) !== ''
        ? [{ name: p.name, phone: p.phone }]
        : [],
    ),
  );
}

async function ownersLabels(
  userId: string,
  phones: readonly string[],
): Promise<Map<string, string[]>> {
  const result = await query<{ phone: string; alias: string }>(
    `SELECT phone, alias FROM "UserAlias"
      WHERE "contactId" = $1::int AND regexp_replace(phone, '\\D', '', 'g') = ANY($2::text[])
      LIMIT $3`,
    [userId, phones, MAX_EXCLUSIONS_READ],
    QUERY_TIMEOUT_MS,
  );
  const byPhone = new Map<string, string[]>();
  for (const row of result.rows) {
    const digits = phoneDigits(row.phone);
    byPhone.set(digits, [...(byPhone.get(digits) ?? []), row.alias]);
  }
  return byPhone;
}

/** Keeps what the owner's line ruled out, for the goal of this conversation. */
export async function keepRuledOutBridges(
  userId: string,
  threadId: number,
  line: string,
): Promise<string[]> {
  const goal = await getOpenTaskByThread(threadId);
  if (goal === null) return [];
  const people = planPeople(goal.plan, goal.plan_proposed);
  if (people.length === 0) return [];
  const phones = [...new Set(people.map((p) => phoneDigits(p.phone)))];
  const labels = await ownersLabels(userId, phones);
  const candidates = phones.map((phone) => ({
    phone,
    labels: [
      ...people.filter((p) => phoneDigits(p.phone) === phone).map((p) => p.name),
      ...(labels.get(phone) ?? []),
    ],
  }));
  const ruledOut = ruledOutIn(line, candidates);
  const reason = line.trim().slice(0, MAX_REASON_CHARS);
  for (const phone of ruledOut) {
    await saveContactExclusion(userId, phone, goal.title, reason);
  }
  if (ruledOut.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[ruled-out] goal ${goal.id}: ${ruledOut.length} person(s) kept out (#6358)`);
  }
  return ruledOut;
}

/**
 * Whether an exclusion's scope is about this subject: its words in the
 * subject, stem either way — two of them when it has two or more, so a word
 * every goal shares („help", „find", „introduction") is never enough alone.
 */
const SHARED_WORDS_NEEDED = 2;

export function scopeCovers(scope: string, subjectTerms: readonly string[]): boolean {
  const scopeTerms = queryTerms(scope);
  const shared = scopeTerms.filter((s) =>
    subjectTerms.some((t) => s === t || s.startsWith(t) || t.startsWith(s)),
  ).length;
  return shared > 0 && shared >= Math.min(SHARED_WORDS_NEEDED, scopeTerms.length);
}

/** The phones this owner ruled out for anything this subject is about. */
export async function ruledOutOnSubject(userId: string, subject: string): Promise<string[]> {
  const terms = queryTerms(subject);
  if (terms.length === 0) return [];
  const result = await query<{ contact_phone: string; excluded_for: string }>(
    `SELECT contact_phone, excluded_for FROM contact_exclusions
      WHERE user_id = $1::int
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, MAX_EXCLUSIONS_READ],
    QUERY_TIMEOUT_MS,
  );
  return result.rows
    .filter((row) => scopeCovers(row.excluded_for, terms))
    .map((row) => phoneDigits(row.contact_phone));
}
