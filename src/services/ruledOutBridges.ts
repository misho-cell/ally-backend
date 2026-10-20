import { query } from '../db/postgres/client';
import { queryTerms } from './askBoundary.service';
import { labelNamedIn, latinLabelNamedInGeorgian } from './namedLabel';
import { phoneDigits } from './phone';
import { getOpenTaskByThread } from './taskStore.service';
import { saveContactExclusion } from './tools/contactExclusions';
import { georgianToLatin, hasGeorgian } from './tools/transliterate';

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

/**
 * The tester's 69082 (#6358, 3 of 3): „never involve Gia in my matters" was
 * kept as „ყველა საქმე" / „ნებისმიერი საქმე" (all / any matter), which shares
 * no word with „a notary for inheritance papers", so the next chat asked Gia.
 * A scope that is only „every" plus a word for „matter" is every subject.
 */
const EVERY_WORDS: readonly string[] = [
  'ყველა',
  'ნებისმიერ',
  'ყველაფერ',
  'all',
  'any',
  'every',
  'everything',
  'все',
  'всё',
  'любо',
  'todo',
  'toda',
  'cualquier',
];
const MATTER_WORDS: readonly string[] = [
  'საქმ',
  'საკითხ',
  'რამ',
  'matter',
  'thing',
  'issue',
  'case',
  'affair',
  'дел',
  'вопрос',
  'asunto',
  'cosa',
  'tema',
];
/** Whole words that carry no subject: „all MY matters" is still every matter. */
const FILLER_WORDS: ReadonlySet<string> = new Set([
  'ჩემი',
  'ჩემს',
  'ჩემ',
  'ჩემთვის',
  'my',
  'mine',
  'of',
  'in',
  'for',
  'the',
  'мои',
  'моих',
  'в',
  'mis',
  'en',
  'de',
]);
const SCOPE_WORD_RE = /[\p{L}\p{M}]+/gu;

function startsWithAny(word: string, stems: readonly string[]): boolean {
  return stems.some((stem) => word.startsWith(stem));
}

export function scopeIsEverything(scope: string): boolean {
  const words = scope.toLowerCase().match(SCOPE_WORD_RE) ?? [];
  return (
    words.some((w) => startsWithAny(w, EVERY_WORDS)) &&
    words.every(
      (w) => FILLER_WORDS.has(w) || startsWithAny(w, EVERY_WORDS) || startsWithAny(w, MATTER_WORDS),
    )
  );
}

export function scopeCovers(scope: string, subjectTerms: readonly string[]): boolean {
  if (scopeIsEverything(scope)) return true;
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

/**
 * #6358 (the tester's 69148, 3 of 4): „გია ლომთაძე ჩემს საქმეებში არასდროს
 * ჩართო" — the run saved no exclusion (or saved it as a fact) and still told the
 * owner „შევინახე", so the next chat put Gia in the plan. A clause with a
 * „never" word that names exactly one of the owner's own contacts is kept by
 * the server itself, whether a goal exists yet or not. The scope is every
 * matter unless the clause names a subject of its own.
 */
const NEVER_WORDS: ReadonlySet<string> = new Set([
  'არასდროს',
  'აღარასდროს',
  'ნურასდროს',
  'never',
  'никогда',
  'nunca',
]);
const INVOLVE_WORDS: readonly string[] = [
  'ჩართ',
  'ჩაერი',
  'ჰკითხ',
  'მისწერ',
  'დაუკავშირ',
  'შესთავაზ',
  'involve',
  'include',
  'ask',
  'contact',
  'suggest',
  'привлека',
  'спрашива',
];
const EVERY_MATTER = 'ყველა საქმე';
const MIN_NAME_WORD_CHARS = 3;
const MAX_NAMED_READ = 50;

function holdsNever(clause: string): boolean {
  return clause
    .toLowerCase()
    .split(WORD_SPLIT_RE)
    .some((word) => NEVER_WORDS.has(word));
}

/** A clause word that is one of the label's words, in either script („ლომთაძე" / „Lomtadze"). */
function namesLabelWord(word: string, nameWords: ReadonlySet<string>): boolean {
  const spellings = hasGeorgian(word) ? [word, georgianToLatin(word)] : [word];
  return [...nameWords].some(
    (n) => n.length >= MIN_NAME_WORD_CHARS && spellings.some((w) => w.startsWith(n)),
  );
}

/** What the clause is about once the name, „never" and the verb are taken out. */
export function neverScope(clause: string, label: string): string {
  const nameWords = new Set(label.toLowerCase().split(WORD_SPLIT_RE));
  const rest = clause
    .toLowerCase()
    .split(WORD_SPLIT_RE)
    .filter((w) => w !== '' && !NEVER_WORDS.has(w))
    .filter((w) => !namesLabelWord(w, nameWords))
    .filter((w) => !INVOLVE_WORDS.some((v) => w.startsWith(v)));
  if (rest.length === 0) return EVERY_MATTER;
  const asScope = `ყველა ${rest.join(' ')}`;
  return scopeIsEverything(asScope) ? EVERY_MATTER : rest.join(' ');
}

/**
 * The tester's 69301 (#6358, 61518): „გია ლომთაძე … არასდროს ჩართო" against the
 * owner's „Gia Lomtadze" matched nothing — the read looked for Georgian letters
 * in a Latin label, so the cross-script check below never saw the row. A
 * Georgian word is looked for in Latin letters too.
 */
function namePatterns(words: readonly string[]): string[] {
  const spellings = words.flatMap((w) => (hasGeorgian(w) ? [w, georgianToLatin(w)] : [w]));
  return [...new Set(spellings.map((w) => `%${w.slice(0, MIN_NAME_WORD_CHARS + 1)}%`))];
}

async function ownersContactsNamedIn(
  userId: string,
  clause: string,
): Promise<Array<{ phone: string; label: string }>> {
  const words = clause
    .split(WORD_SPLIT_RE)
    .filter((w) => w.length >= MIN_NAME_WORD_CHARS && !NEVER_WORDS.has(w.toLowerCase()));
  if (words.length === 0) return [];
  const result = await query<{ phone: string; alias: string }>(
    `SELECT phone, alias FROM "UserAlias"
      WHERE "contactId" = $1::int AND alias ILIKE ANY($2::text[])
      LIMIT $3`,
    [userId, namePatterns(words), MAX_NAMED_READ],
    QUERY_TIMEOUT_MS,
  );
  return result.rows
    .filter((r) => labelNamedIn(clause, r.alias) || latinLabelNamedInGeorgian(clause, r.alias))
    .map((r) => ({ phone: phoneDigits(r.phone), label: r.alias }));
}

/** Keeps every „never <contact>" in the owner's line as an exclusion; returns the phones kept. */
export async function keepNeverInvolved(userId: string, line: string): Promise<string[]> {
  const kept: string[] = [];
  for (const clause of line.split(CLAUSE_SPLIT_RE)) {
    if (!holdsNever(clause)) continue;
    const named = await ownersContactsNamedIn(userId, clause);
    const phones = [...new Set(named.map((n) => n.phone))];
    if (phones.length !== 1) continue;
    const reason = line.trim().slice(0, MAX_REASON_CHARS);
    await saveContactExclusion(userId, phones[0], neverScope(clause, named[0].label), reason);
    kept.push(phones[0]);
  }
  if (kept.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[ruled-out] ${kept.length} person(s) kept out on the owner's „never" (#6358)`);
  }
  return kept;
}
