import { query } from '../db/postgres/client';

/**
 * Misho, 26 Nov (Giorgi's snowboard case): the answer was right, then its last
 * question named an own contact no search had brought — saved under a place
 * word that matched nothing in the request. The model took the name from
 * nowhere the run can show.
 *
 * After the reply is written, a run of two or three words that is exactly one
 * of the owner's saved names, and that appears nowhere the run read (the
 * thread so far, the prompt, every tool result), is a person the reply made
 * up a tie for: the line naming them is taken out.
 */
const MIN_NAME_WORDS = 2;
const MAX_NAME_WORDS = 3;
const WORD_RE = /\p{L}[\p{L}'’]*/gu;
const BETWEEN_WORDS_RE = /^[ \t]+$/u;
const LATIN_RE = /^[A-Za-z]/u;
const CAPITAL_RE = /^\p{Lu}/u;
/** At most this many spans are looked up: a reply is a few hundred words. */
const MAX_SPANS = 400;
/** At most this many saved names come back from one look-up. */
const MAX_ALIASES = 20;
const ALIAS_LOOKUP_TIMEOUT_MS = 3_000;

interface Word {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

function wordsOf(reply: string): Word[] {
  return [...reply.matchAll(WORD_RE)].map((m) => ({
    text: m[0],
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
}

/** A Latin name is written with capitals; a Georgian one has none to check. */
function looksLikeAName(words: readonly Word[]): boolean {
  return words.every((w) => !LATIN_RE.test(w.text) || CAPITAL_RE.test(w.text));
}

/** Pure: every run of two or three words on one line that could be a saved name, lower-cased. */
export function nameSpans(reply: string): string[] {
  const words = wordsOf(reply);
  const spans = new Set<string>();
  for (let size = MIN_NAME_WORDS; size <= MAX_NAME_WORDS; size += 1) {
    for (let i = 0; i + size <= words.length; i += 1) {
      const window = words.slice(i, i + size);
      const joined = window.every(
        (w, k) => k === 0 || BETWEEN_WORDS_RE.test(reply.slice(window[k - 1].end, w.start)),
      );
      if (!joined || !looksLikeAName(window)) continue;
      spans.add(window.map((w) => w.text.toLocaleLowerCase()).join(' '));
    }
  }
  return [...spans].slice(0, MAX_SPANS);
}

/** The owner's saved names that are exactly one of the spans. */
export async function ownerNamesAmong(
  ownerId: number,
  spans: readonly string[],
): Promise<string[]> {
  if (spans.length === 0) return [];
  const result = await query<{ alias: string }>(
    `SELECT DISTINCT TRIM(alias) AS alias FROM "UserAlias"
      WHERE "contactId" = $1 AND lower(regexp_replace(TRIM(alias), '\\s+', ' ', 'g')) = ANY($2::text[])
      LIMIT ${MAX_ALIASES}`,
    [ownerId, spans],
    ALIAS_LOOKUP_TIMEOUT_MS,
  );
  return result.rows.map((row) => row.alias);
}

/** Pure: the saved names the run never read — not in the thread, the prompt or any tool result. */
export function namesFromNowhere(names: readonly string[], readText: string): string[] {
  const read = readText.toLocaleLowerCase();
  return names.filter((name) => !read.includes(name.toLocaleLowerCase().replace(/\s+/gu, ' ')));
}

function namesLine(line: string, names: readonly string[]): boolean {
  const spans = new Set(nameSpans(line));
  return names.some((name) => spans.has(name.toLocaleLowerCase().replace(/\s+/gu, ' ')));
}

/** Pure: the reply without the lines that name one of these people; unchanged if nothing would be left. */
export function withoutLinesNaming(reply: string, names: readonly string[]): string {
  if (names.length === 0) return reply;
  const lines = reply.split('\n');
  const kept = lines.filter((line) => !namesLine(line, names));
  if (kept.length === lines.length || kept.join('').trim() === '') return reply;
  return kept
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}
