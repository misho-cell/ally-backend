/**
 * Misho, 24 Nov: „in the text, a person's first and last name, and a company's
 * name, wherever they come, should be in bold." WhatsApp makes text between
 * asterisks bold. The names are the ones this conversation's searches found —
 * the server's own list, not the model's say — so nothing else is bolded, and
 * the bold is the WhatsApp copy's only: the stored answer stays as it was.
 */

/** A shorter name would match inside ordinary words. */
const MIN_NAME_CHARS = 4;
/** A name longer than this is a sentence, not a name. */
const MAX_NAME_CHARS = 60;
/** Names kept per conversation, at most. */
const MAX_NAMES = 300;
/** How long a conversation's names are kept: past its second answer. */
const KEPT_MS = 60 * 60_000;
/** Fields that hold a company's name rather than a person's. */
const COMPANY_FIELDS: ReadonlySet<string> = new Set([
  'company',
  'company_name',
  'employer',
  'firm',
  'organisation',
  'organization',
]);
/** Lists whose rows are companies by their `name`. */
const COMPANY_LISTS: ReadonlySet<string> = new Set(['companies']);
/** A Georgian case ending added to a name in a sentence („ნინოს", „მეფარიშვილთან"). */
const GEORGIAN_ENDING = '[\\u10D0-\\u10FF]{0,5}';
/** A Georgian name's last vowel, which a case ending may drop („მეფარიშვილ-თან", „აბულაძ-ის"). */
const DROPPED_VOWEL = /[აეიოუ]$/u;
const LETTER = '\\p{L}';

function usable(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  return (
    trimmed.length >= MIN_NAME_CHARS &&
    trimmed.length <= MAX_NAME_CHARS &&
    !/[[\]{}<>@*_~]/u.test(trimmed) &&
    /\p{L}/u.test(trimmed)
  );
}

/** Pure: the people's and companies' names a tool result holds, once each. */
export function namesIn(value: unknown): string[] {
  const names = new Set<string>();
  const visit = (node: unknown, key: string | null): void => {
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, key));
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const row = node as Record<string, unknown>;
    const isPerson = typeof row.phone === 'string' || typeof row.contact_id === 'string';
    if ((isPerson || (key !== null && COMPANY_LISTS.has(key))) && usable(row.name)) {
      names.add(row.name.trim());
    }
    for (const [field, value] of Object.entries(row)) {
      if (COMPANY_FIELDS.has(field) && usable(value)) names.add(value.trim());
      if (typeof value === 'object') visit(value, field);
    }
  };
  visit(value, null);
  return [...names];
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** The name as it may stand in a sentence: its last word may carry a Georgian ending. */
function namePattern(name: string): string {
  const words = name.split(/\s+/u);
  const last = words.pop() ?? '';
  const stem =
    DROPPED_VOWEL.test(last) && [...last].length > MIN_NAME_CHARS ? last.slice(0, -1) : last;
  const tail = stem === last ? escaped(last) : `${escaped(stem)}(?:${escaped(last.slice(-1))})?`;
  return [...words.map(escaped), `${tail}${GEORGIAN_ENDING}`].join('\\s+');
}

/**
 * Pure: the text with each name bold (*name*), the longest first so a full
 * name is not cut by its first word; never inside a word, never twice.
 */
export function withBoldNames(text: string, names: readonly string[]): string {
  const sorted = [...new Set(names.filter(usable).map((n) => n.trim()))].sort(
    (a, b) => b.length - a.length,
  );
  if (sorted.length === 0) return text;
  const pattern = new RegExp(
    `(?<![${LETTER}*])(?:${sorted.map(namePattern).join('|')})(?![${LETTER}*])`,
    'gu',
  );
  return text.replace(pattern, (match) => `*${match}*`);
}

interface KeptNames {
  readonly names: Set<string>;
  until: number;
}

const kept = new Map<string, KeptNames>();
const keyOf = (userId: number, threadId: number): string => `${userId}:${threadId}`;

/** Remembers the names a run in this conversation found, for its WhatsApp copies. */
export function noteBoldNames(
  userId: number,
  threadId: number,
  names: readonly string[],
  now: number = Date.now(),
): void {
  if (names.length === 0) return;
  const key = keyOf(userId, threadId);
  const held = kept.get(key);
  const set = held !== undefined && held.until >= now ? held.names : new Set<string>();
  for (const name of names) {
    if (set.size >= MAX_NAMES) break;
    set.add(name);
  }
  kept.set(key, { names: set, until: now + KEPT_MS });
}

/** The names this conversation's searches found lately. */
export function boldNamesFor(userId: number, threadId: number, now: number = Date.now()): string[] {
  const held = kept.get(keyOf(userId, threadId));
  if (held === undefined) return [];
  if (held.until < now) {
    kept.delete(keyOf(userId, threadId));
    return [];
  }
  return [...held.names];
}

/** Forget everything kept — for tests. */
export function forgetBoldNames(): void {
  kept.clear();
}
