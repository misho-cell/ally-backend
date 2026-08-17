// Ticket 6 item 12: long research replies open with process talk — "ახლა
// სრული სურათი მაქვს", "კარგი კითხვაა" — instead of the answer. Four prompt
// attempts failed (the model just rephrases); this is the deterministic strip.
// Conservative on purpose: only long multi-paragraph replies, only the FIRST
// sentence, only when it is recognizably process talk carrying no content,
// and never more than one sentence. Every strip is logged for a false-positive
// audit.
//
// Modes (env OPENER_STRIP): 'patterns' (default) — strip only sentences that
// match the process-talk classes below; 'invert' — the tester's proposal
// (ticket 6 response §3.3): DROP the first sentence of a long reply unless it
// carries content (a digit, a quote, a colon-led finding), because a phrase
// list can be paraphrased around. Invert also logs what it KEEPS, so its
// false-negative rate is auditable; 'off' — inert. Georgian has no capital
// letters, so a person's name in the first sentence is NOT reliably
// detectable — that is the risk invert carries and why patterns is the
// default until an audit says otherwise.

const OPENER_MIN_REPLY_CHARS = 600;
const OPENER_MAX_SENTENCE_CHARS = 160;

// The process-talk classes, from the live escapes (threads 9104, 9118, 9123,
// 9124, 9125, and 9144 from the verification round): claiming the picture is
// complete, claiming enough was gathered, narrating where it looked,
// announcing assembly, or complimenting the question.
const OPENER_PATTERNS: readonly RegExp[] = [
  // "picture is now complete/sharp" in any of its produced permutations.
  /სურათ\S*\s+(?:\S+\s+){0,3}?(?:მაქვს|გამიჩნდა|სრულია|მკვეთრი|ნათელია|გახდა)|(?:სრული|მკვეთრი|ნათელი)\s+სურათ/u,
  // "I gathered enough information" (thread 9144's escape).
  /(?:საკმარისი|საჭირო)\s+ინფორმაცია\s+(?:\S+\s+){0,2}?(?:დავაგროვე|მაქვს|შევკრიბე)|ინფორმაცია\s+დავაგროვე/u,
  // "I looked at web/network/sources" narration.
  /(?:ვნახე|გავიარე|ვეძებე|შევამოწმე|მოვიძიე)[\s\S]{0,40}?(?:ვები|ქსელ|წყარო|forbes)|(?:ვები|ქსელ|forbes)[\s\S]{0,40}?(?:ვნახე|გავიარე|შევამოწმე|სამივე)/iu,
  // Assembling verbs.
  /ვაწყობ|ვაჯამებ|გავაცნო\s+შედეგებ|გაგაცნობ\s+შედეგებ|ჩამოვაყალიბებ|ვწერ\s+პასუხს|პასუხს\s+ვწერ/u,
  // Complimenting the question.
  /კარგი\s+კითხვაა|კარგი\s+შეკითხვაა|სწორი\s+შეკითხვაა|შესანიშნავი\s+კითხვაა/u,
];

// Content markers that PROTECT a first sentence in invert mode: a number, a
// quoted string, or a colon (a finding introduces itself with one).
const CONTENT_MARKERS = /[\d:„"«]/u;

// First sentence = up to the first ., !, ? or … followed by whitespace.
const FIRST_SENTENCE_RE = /^[^.!?…\n]{2,}?[.!?…]+(?=\s)/u;

type OpenerMode = 'patterns' | 'invert' | 'off';

function openerMode(): OpenerMode {
  const raw = process.env.OPENER_STRIP?.trim().toLowerCase();
  if (raw === 'off') return 'off';
  if (raw === 'invert') return 'invert';
  return 'patterns';
}

/**
 * Remove the reply's first sentence when it is contentless process talk.
 * Applied before the reply is persisted, so the stored text is clean too.
 */
export function stripProcessOpener(reply: string, threadId: number): string {
  const mode = openerMode();
  if (mode === 'off') return reply;
  const trimmed = reply.trimStart();
  // Short or single-paragraph replies are never touched.
  if (trimmed.length < OPENER_MIN_REPLY_CHARS || !/\n/.test(trimmed)) return reply;

  const match = FIRST_SENTENCE_RE.exec(trimmed);
  if (!match) return reply;
  const sentence = match[0];
  if (sentence.length > OPENER_MAX_SENTENCE_CHARS) return reply;
  // A digit means a finding, whatever the phrasing — always protected.
  if (/\d/.test(sentence)) return reply;

  const isProcessTalk = OPENER_PATTERNS.some((p) => p.test(sentence));
  const shouldStrip =
    mode === 'invert' ? isProcessTalk || !CONTENT_MARKERS.test(sentence) : isProcessTalk;

  if (!shouldStrip) {
    if (mode === 'invert') {
      // Invert audits both directions: what it keeps is as informative as
      // what it drops.
      // eslint-disable-next-line no-console
      console.log(`[opener-keep] thread ${threadId}: "${sentence}"`);
    }
    return reply;
  }

  const rest = trimmed.slice(sentence.length).trimStart();
  // Never remove a sentence that IS the reply.
  if (rest.length === 0) return reply;

  // eslint-disable-next-line no-console
  console.log(`[opener-strip] thread ${threadId}: "${sentence}"`);
  return rest;
}
