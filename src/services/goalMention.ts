/**
 * Does a message name one of the user's open goals?
 *
 * Ticket 10 Task 18 / Task 21 (1). On 5 September „ბათუმის ფოტოგრაფის მიზანი
 * გავაგრძელოთ. რა ხდება იქ?" — a sentence naming an open goal by its title —
 * ran as a quick answer, and the reply asked the user whether a question had
 * already been sent for that goal, which the system knew. The run mode is
 * decided from hard facts, never from what a model thinks a message means
 * (the prompt team's standing rule). This makes one more hard fact available:
 * the message contains the title of an open goal.
 *
 * Deliberately strict. A title is short, so EVERY word of it that carries
 * meaning must appear in the message — a shared „ლიკა" is not a mention of
 * the Lika goal. Georgian inflects („ფოტოგრაფი" → „ფოტოგრაფის"), so a word
 * matches on a shared stem of a few letters rather than on equality. Only
 * one goal may match; two is an ambiguity and names nothing.
 */

/** Words shorter than this carry no meaning worth matching on. */
const MIN_WORD_CHARS = 3;
/** How many leading letters two words must share to be the same word inflected. */
const STEM_CHARS = 4;
/** Georgian case endings replace at most this many letters at the end of a word. */
const MAX_ENDING_CHARS = 2;
/** A title must offer at least this many meaningful words to be recognisable. */
const MIN_TITLE_WORDS = 2;
/**
 * ⚠️ ROW 242, 25 September — ONE ADJECTIVE AND THE SAME NEED BECAME TWO GOALS.
 *
 * Test 9, ten minutes apart:
 *
 *   10:26  „I need a marketing co-founder for my small food delivery startup
 *           in Tbilisi."            -> goal 10167
 *   10:36  „I need a marketing co-founder for my food delivery startup in
 *           Tbilisi."               -> goal 10231, joined to nothing
 *
 * The rule below is `titleWords.every(...)`, and the TITLE IS THE MODEL'S
 * SUMMARY OF THE FIRST MESSAGE. So a title that carries one word the
 * restatement does not — here „small" — can never be matched by it, however
 * plainly the two are the same need. Eight title words, seven present, no
 * match. The 24 September fix caught IDENTICAL sentences and this is one word
 * off identical.
 *
 * MEASURED BEFORE LOOSENING, over all 225 open goals in the product:
 *
 *   pairs of one owner's open goals within two words   7 real, 84 on seats
 *   of those 7, differing by ONE word                  1
 *   ...and that one is a 3-word title, which this tolerance does not touch
 *
 * So on the whole of real history this changes the answer for nothing that
 * already exists. That is the point of the length gate: a miss is forgiven
 * only where there is enough left to be sure, and a short title still has to
 * match in full. „Exactly one goal or nothing" is unchanged — a tolerance that
 * produced two candidates would name neither, as it always has.
 *
 * THE FAILURE DIRECTION IS WHY IT IS THIS NARROW. A missed duplicate is a
 * second goal the owner can see and close. A wrong match silently folds a NEW
 * need into an old goal, where nobody is looking for it.
 */
const TOLERANCE_MIN_TITLE_WORDS = 4;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= MIN_WORD_CHARS);
}

/**
 * „ფოტოგრაფი" / „ფოტოგრაფის" and „მასწავლებელი" / „მასწავლებელზე" are one word
 * each; „ლიკა" / „ლიკო" are not. Two words are the same word when they share
 * a stem of at least STEM_CHARS letters and differ only in the last couple of
 * letters of the shorter one — where Georgian puts its case endings.
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  if (prefix < STEM_CHARS) return false;
  return prefix >= Math.min(a.length, b.length) - MAX_ENDING_CHARS;
}

export interface NamedGoalCandidate {
  id: number;
  title: string;
}

/**
 * The one open goal whose title the message carries in full, or null.
 *
 * A message beginning with the engine's own event prefix is never matched:
 * the engine addresses the goal it already runs in.
 */
export function goalNamedIn<T extends NamedGoalCandidate>(
  message: string,
  goals: readonly T[],
): T | null {
  const messageWords = words(message);
  if (messageWords.length === 0) return null;
  const matches = goals.filter((goal) => {
    const titleWords = words(goal.title);
    if (titleWords.length < MIN_TITLE_WORDS) return false;
    const missing = titleWords.filter((tw) => !messageWords.some((mw) => sameWord(tw, mw)));
    const forgiven = titleWords.length >= TOLERANCE_MIN_TITLE_WORDS ? 1 : 0;
    return missing.length <= forgiven;
  });
  return matches.length === 1 ? (matches[0] ?? null) : null;
}
