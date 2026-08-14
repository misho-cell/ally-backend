// Ticket 6 item 12: long research replies open with process talk — "ახლა
// სრული სურათი მაქვს", "კარგი კითხვაა" — instead of the answer. Four prompt
// attempts failed (the model just rephrases); this is the deterministic strip.
// Conservative on purpose: only long multi-paragraph replies, only the FIRST
// sentence, only when it is recognizably process talk carrying no content,
// and never more than one sentence. Every strip is logged for a false-positive
// audit; OPENER_STRIP=off turns it off without a deploy.

const OPENER_MIN_REPLY_CHARS = 600;
const OPENER_MAX_SENTENCE_CHARS = 160;

// The process-talk classes, from tonight's live attempts (threads 9104, 9118,
// 9123, 9124, 9125): claiming the picture is now complete, narrating where it
// looked, announcing assembly, or complimenting the question.
const OPENER_PATTERNS: readonly RegExp[] = [
  // "picture is now complete/sharp" in any of its produced permutations.
  /სურათ\S*\s+(?:\S+\s+){0,3}?(?:მაქვს|გამიჩნდა|სრულია|მკვეთრი|ნათელია|გახდა)|(?:სრული|მკვეთრი|ნათელი)\s+სურათ/u,
  // "I looked at web/network/sources" narration.
  /(?:ვნახე|გავიარე|ვეძებე|შევამოწმე|მოვიძიე)[\s\S]{0,40}?(?:ვები|ქსელ|წყარო|forbes)|(?:ვები|ქსელ|forbes)[\s\S]{0,40}?(?:ვნახე|გავიარე|შევამოწმე|სამივე)/iu,
  // Assembling verbs.
  /ვაწყობ|ვაჯამებ|გავაცნო\s+შედეგებ|გაგაცნობ\s+შედეგებ|ჩამოვაყალიბებ/u,
  // Complimenting the question.
  /კარგი\s+კითხვაა|კარგი\s+შეკითხვაა|სწორი\s+შეკითხვაა|შესანიშნავი\s+კითხვაა/u,
];

// First sentence = up to the first ., !, ? or … followed by whitespace.
const FIRST_SENTENCE_RE = /^[^.!?…\n]{2,}?[.!?…]+(?=\s)/u;

function openerStripEnabled(): boolean {
  return process.env.OPENER_STRIP?.trim().toLowerCase() !== 'off';
}

/**
 * Remove the reply's first sentence when it is contentless process talk.
 * Applied before the reply is persisted, so the stored text is clean too.
 */
export function stripProcessOpener(reply: string, threadId: number): string {
  if (!openerStripEnabled()) return reply;
  const trimmed = reply.trimStart();
  // Short or single-paragraph replies are never touched.
  if (trimmed.length < OPENER_MIN_REPLY_CHARS || !/\n/.test(trimmed)) return reply;

  const match = FIRST_SENTENCE_RE.exec(trimmed);
  if (!match) return reply;
  const sentence = match[0];
  // The sentence must be short, carry no digits (a number means a finding),
  // and match a process-talk class. Anything else stays.
  if (sentence.length > OPENER_MAX_SENTENCE_CHARS) return reply;
  if (/\d/.test(sentence)) return reply;
  if (!OPENER_PATTERNS.some((p) => p.test(sentence))) return reply;

  const rest = trimmed.slice(sentence.length).trimStart();
  // Never remove a sentence that IS the reply.
  if (rest.length === 0) return reply;

  // eslint-disable-next-line no-console
  console.log(`[opener-strip] thread ${threadId}: "${sentence}"`);
  return rest;
}
