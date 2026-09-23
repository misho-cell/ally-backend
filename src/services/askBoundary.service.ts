import Anthropic from '@anthropic-ai/sdk';
import { query } from '../db/postgres/client';
import anthropic from '../config/anthropic';
import { parseModelJson } from './modelJson';
import { recordClaudeUsage } from './costLedger.service';
import { normalizeSearchToken } from './tools/normalizeSearchToken';
import { georgianStem } from './tools/georgianStem';

/**
 * ROW 247 — „DO NOT ASK ME ABOUT PLUMBERS" HAS TO REACH OTHER PEOPLE'S
 * SEARCHES, AND UNTIL NOW IT REACHED NOTHING AT ALL.
 *
 * THE FOUNDER, 22 September (D421): „if a person prefers not to be asked about
 * it, she has not to be in plan, because the search system finds that she has
 * asked her assistant not to bother her with it." And the reasoning, which is
 * the part that decides the shape: „Always remember, it's a human assistant.
 * If my human assistant knows that Nino will not answer, then my human
 * assistant will never ask Nino about it — because she knows she will not
 * answer."
 *
 * So: absent, silently. Not named and marked. Not named and refused at the
 * send. The asking owner is never told there was a boundary, because a human
 * assistant would not announce it either — nobody's privacy is spent and
 * nobody's time is wasted.
 *
 * HE ALSO REFUSED THE ALL-OR-NOTHING BUTTON, in the same ruling: „I don't
 * think we have to have that button, that nobody contacts me about anything.
 * It's not an option. I don't like it." His argument is that a person who will
 * help nobody with anything does not need to be in the network. So this is a
 * TOPIC boundary and there is deliberately no „everything" value for it.
 *
 * ────────────────────────────────────────────────────────────────────────
 * AND THE DANGER, WHICH IS MINE TO NAME BECAUSE I HAVE CAUSED IT BEFORE.
 *
 * A silent exclusion is invisible. On 17 September a guard I wrote took search
 * away from ten real goals and nobody noticed for three days, because a
 * filtered-out person and a person who does not exist look identical from
 * every seat. Every function here that removes somebody says so in the log
 * with a count, and `boundaryExclusionsFor` is exported so a measurement can
 * ask the question directly rather than inferring it from silence.
 * ────────────────────────────────────────────────────────────────────────
 */

/** Small: this sits in front of a note somebody is waiting for a reply to. */
const DETECT_BUDGET_MS = 6_000;
const DETECT_MODEL = 'claude-haiku-4-5-20251001';
const DETECT_MAX_TOKENS = 200;

/** A preference note is a sentence. Longer than this and it is something else. */
const MAX_NOTE_CHARS = 600;

/** A boundary covering more than this is the „everything" button by another name. */
const MAX_TERMS = 12;

/** Below this a term matches half the language: „it", „ia", „ke". */
const MIN_TERM_CHARS = 3;

/** One search's own words. Beyond this the query is not a topic. */
const MAX_QUERY_WORDS = 24;

const QUERY_TIMEOUT_MS = 5_000;

export interface AskBoundary {
  /** The person's own words for what they do not want to be asked about. */
  readonly topic: string;
  /** The normalized words a search is compared against. */
  readonly terms: readonly string[];
}

/**
 * The comparable form of one word: the database's own normalization, then the
 * Georgian stem — the same pair the tag search compares by, so a boundary and
 * a search agree about what „სანტექნიკოსი" and „santexniki" are.
 */
export function boundaryTerm(word: string): string {
  return georgianStem(normalizeSearchToken(word.trim()));
}

/** The words of a search query, in the form the stored terms are in. */
export function queryTerms(searchQuery: string): string[] {
  const words = searchQuery
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= MIN_TERM_CHARS)
    .slice(0, MAX_QUERY_WORDS);
  return [...new Set(words.map(boundaryTerm))].filter((t) => t.length >= MIN_TERM_CHARS);
}

/**
 * WHY A MODEL AND NOT A REGEX. „Never pass me those questions", „no plumbing
 * questions please", „აღარ მკითხო სანტექნიკაზე" — and the same sentence in
 * four languages with the negation in four different places. A pattern that
 * caught the seat's two test sentences and missed a real person's is worse
 * than nothing here, because what it misses is a boundary somebody was
 * promised.
 *
 * IT ALSO PRODUCES THE VARIANTS, and that is the second reason. „plumber" and
 * „plumbing" share no prefix and this codebase has no English stemmer; asked
 * for the words a boundary covers, a model gives both, plus the Georgian the
 * person did not happen to type. Those words are then just data — the matching
 * below is exact-or-prefix on normalized forms and has no cleverness in it.
 *
 * FAIL-CLOSED MEANS „NO BOUNDARY" HERE, which is today's behaviour exactly. A
 * model that is down or unparseable leaves the product doing what it already
 * does, so the worst this can do is what already happens. The opposite
 * direction — inventing a boundary on a failure — would silently remove a real
 * person from other people's searches, and nobody would see it.
 */
export async function detectAskBoundary(noteText: string): Promise<AskBoundary | null> {
  const text = noteText.trim();
  if (text === '' || text.length > MAX_NOTE_CHARS) return null;

  try {
    const response = await anthropic.messages.create(
      {
        model: DETECT_MODEL,
        max_tokens: DETECT_MAX_TOKENS,
        messages: [
          {
            role: 'user',
            content:
              `A person told their own assistant this about themselves: "${text}"\n\n` +
              'Is it a request NOT to be asked about a particular subject, so that other ' +
              "people's assistants should leave them out when looking for help on it?\n\n" +
              'If it is, answer with the subject in their own words and the words a search ' +
              'for that subject would use — include obvious forms (plumber, plumbing) and ' +
              'the Georgian, Russian or English equivalents even if they did not write them.\n' +
              'A request about ANY and EVERY subject is NOT one of these — answer no.\n' +
              'A preference about tone, timing, language or how they like to be written to ' +
              'is NOT one of these — answer no.\n\n' +
              'Reply JSON only: {"boundary":false} or ' +
              '{"boundary":true,"topic":"their words","terms":["word","word"]}',
          },
        ],
      },
      { timeout: DETECT_BUDGET_MS },
    );
    void recordClaudeUsage({
      userId: null,
      kind: 'ask_boundary',
      model: DETECT_MODEL,
      usage: response.usage,
    }).catch(() => {});

    const answer = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const parsed = parseModelJson<{ boundary?: unknown; topic?: unknown; terms?: unknown }>(answer);
    if (parsed?.boundary !== true) return null;
    if (typeof parsed.topic !== 'string' || parsed.topic.trim() === '') return null;
    if (!Array.isArray(parsed.terms)) return null;

    const terms = [
      ...new Set(
        parsed.terms
          .filter((t): t is string => typeof t === 'string')
          .map(boundaryTerm)
          .filter((t) => t.length >= MIN_TERM_CHARS),
      ),
    ].slice(0, MAX_TERMS);
    if (terms.length === 0) return null;

    return { topic: parsed.topic.trim(), terms };
  } catch {
    return null;
  }
}

/**
 * Record the boundary beside the note it came out of.
 *
 * Best-effort on purpose: the note itself is already saved by the caller and
 * is what the person asked for. A failure here must not turn „noted" into an
 * error on their screen — it costs them a boundary that does not yet work,
 * which is where they were a minute ago.
 */
export async function saveAskBoundary(
  userId: string,
  boundary: AskBoundary,
  noteId: number | null,
): Promise<number> {
  let saved = 0;
  for (const term of boundary.terms) {
    try {
      await query(
        `INSERT INTO ask_boundaries (user_id, topic, term, note_id)
         VALUES ($1::int, $2, $3, $4)
         ON CONFLICT (user_id, term) DO UPDATE SET topic = $2, note_id = $4`,
        [userId, boundary.topic, term, noteId],
        QUERY_TIMEOUT_MS,
      );
      saved += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ask-boundary] could not store a term:', (err as Error).message);
    }
  }
  if (saved > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[ask-boundary] user ${userId}: boundary recorded on ${saved} term(s) — they will be absent from other people's searches for it`,
    );
  }
  return saved;
}

/**
 * The phones of people who have asked not to be involved in THIS subject.
 *
 * Exact or prefix EITHER WAY on the normalized form. Exact is the ordinary
 * case, because the terms were produced for this purpose; the prefix is what
 * carries a Georgian case ending the stemmer left on one side and not the
 * other. It is deliberately not a substring match: „art" inside „quarter" is
 * how a boundary about art would quietly remove somebody from a search for a
 * flat.
 *
 * EMPTY ON ANY FAILURE, so a database hiccup leaves the product doing what it
 * did yesterday rather than hiding people nobody meant to hide. The direction
 * of that error is the opposite of the one in `acceptedIntroductionPhones` and
 * for the same reason in both: fail towards what the person in front of you
 * can see and correct.
 */
export async function boundaryExclusionsFor(searchQuery: string): Promise<string[]> {
  const terms = queryTerms(searchQuery);
  if (terms.length === 0) return [];
  try {
    const result = await query<{ phone: string }>(
      `SELECT DISTINCT up.phone
         FROM ask_boundaries ab
         JOIN "UserPhone" up ON up."userId" = ab.user_id
        WHERE EXISTS (
                SELECT 1 FROM unnest($1::text[]) AS w
                 WHERE ab.term = w
                    OR ab.term LIKE w || '%'
                    OR w LIKE ab.term || '%')`,
      [terms],
      QUERY_TIMEOUT_MS,
    );
    if (result.rows.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[ask-boundary] "${searchQuery}": ${result.rows.length} phone(s) withheld — their own boundary`,
      );
    }
    return result.rows.map((r) => r.phone);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ask-boundary] could not read boundaries:', (err as Error).message);
    return [];
  }
}

/** Their own boundaries, for the one person they belong to. */
export async function askBoundariesOf(userId: string): Promise<AskBoundary[]> {
  const result = await query<{ topic: string; term: string }>(
    `SELECT topic, term FROM ask_boundaries WHERE user_id = $1::int ORDER BY created_at`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  const byTopic = new Map<string, string[]>();
  for (const row of result.rows) {
    const terms = byTopic.get(row.topic) ?? [];
    terms.push(row.term);
    byTopic.set(row.topic, terms);
  }
  return [...byTopic].map(([topic, terms]) => ({ topic, terms }));
}
