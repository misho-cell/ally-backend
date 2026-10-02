/**
 * Team task #365 (G2) — the tester's 982 and four prompt passes since: when
 * the owner's own contacts hold nobody, a goal reply still OPENS with that
 * („შენს პირად კონტაქტებში ადვოკატი ვერ ვიპოვე.") and only then says what the
 * second circle or the web did find. The prompt asks for the reverse and the
 * model keeps forgetting it, so the server now checks the first sentence.
 *
 * WHEN IT MOVES: the reply's first sentence says nothing was found, carries no
 * turn of its own („…ვერ ვიპოვე, მაგრამ…" already leads to the find), and the
 * rest of the reply does report a find — a page link, a list, or a found-verb.
 * Then that sentence goes after the findings, just before a closing question,
 * as its own short paragraph. Nothing is reworded and nothing is dropped.
 *
 * WHEN IT STAYS: a reply that is ONLY „nothing found" (that is the answer), or
 * whose rest only promises to write back — there is no find to lead with.
 */
const MAX_OPENING_CHARS = 300;
const FIRST_SENTENCE_RE = /^[^\n]*?[.!?](?=\s|$)|^[^\n]+/;
const NOTHING_FOUND_RE =
  /ვერ ვიპოვე|ვერავინ|არავინ|ვერ მოიძებნა|არ მოიძებნა|ვერ ვნახე|couldn['’]t find|could not find|found (?:no(?:body| one)?|nothing)\b|no one in your|nobody in your|не нашё?л|никого/i;
const TURN_RE =
  /მაგრამ|თუმცა|გარდა|\bbut\b|\bhowever\b|\bexcept\b|(?<!\p{L})но(?!\p{L})|однако|кроме/iu;
const FIND_IN_REST_RE =
  /https?:\/\/|^\s*(?:\d+[.)]|[-•*])\s|(?<!ვერ |არ |არავინ )(?:ვიპოვე|ვნახე|გამოჩნდა|მოიძებნა)|\bI found\b|(?<!не )нашё?л/imu;
const PARAGRAPH_BREAK = '\n\n';

function openingSentence(text: string): string | null {
  const match = FIRST_SENTENCE_RE.exec(text);
  if (match === null) return null;
  const sentence = match[0].trim();
  return sentence.length > 0 && sentence.length <= MAX_OPENING_CHARS ? sentence : null;
}

function opensWithBareNothingFound(sentence: string): boolean {
  return NOTHING_FOUND_RE.test(sentence) && !TURN_RE.test(sentence);
}

/** The findings with the „nothing found" paragraph set before a closing question. */
function placeBeforeClosingQuestion(rest: string, sentence: string): string {
  const paragraphs = rest.split(/\n\s*\n/);
  const last = paragraphs[paragraphs.length - 1].trim();
  if (paragraphs.length > 1 && last.endsWith('?')) {
    return [...paragraphs.slice(0, -1), sentence, last].join(PARAGRAPH_BREAK);
  }
  return `${rest}${PARAGRAPH_BREAK}${sentence}`;
}

/** The reply opening with what was found; unchanged when it already does. */
export function withNothingFoundLast(text: string): string {
  const trimmed = text.trim();
  const sentence = openingSentence(trimmed);
  if (sentence === null || !opensWithBareNothingFound(sentence)) return text;
  const rest = trimmed.slice(trimmed.indexOf(sentence) + sentence.length).trim();
  if (rest.length === 0 || !FIND_IN_REST_RE.test(rest)) return text;
  // eslint-disable-next-line no-console
  console.warn(`[nothing-found-last] a leading „nothing found" sentence moved after the findings`);
  return placeBeforeClosingQuestion(rest, sentence);
}
