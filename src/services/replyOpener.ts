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
  // The same five classes in English (Ticket 10 Task 19 — thread 12938 opened
  // "Now I have the full picture. Let me put this together for you." and the
  // strip, Georgian-only until then, let both sentences through).
  /\b(?:full|complete|clear|whole)\s+picture\b|\bpicture\s+is\s+(?:now\s+)?(?:complete|clear)\b/i,
  /\b(?:gathered|collected|have)\s+(?:enough|all\s+the|the)\s+(?:information|info|details|context)\b/i,
  /\b(?:i|i've|i have)\s+(?:looked|checked|searched|went|gone)\s+(?:at|through|across)\b[\s\S]{0,40}?\b(?:web|network|sources?|contacts)\b/i,
  /\b(?:let\s+me|i'll|i\s+will)\s+(?:put|pull|bring)\s+(?:this|it|that|everything)\s+together\b|\bhere(?:'s| is)\s+(?:a\s+)?(?:summary|what\s+i\s+(?:found|put\s+together))\b|\b(?:summarizing|summarising|to\s+summarize|to\s+summarise)\b/i,
  /\b(?:great|good|excellent|interesting|fair)\s+question\b/i,
];

/**
 * How many process sentences may be removed from the top of one reply.
 *
 * One was the rule while the escapes were Georgian one-liners. The English
 * escape of 5 September was two sentences of pure process — strip one and the
 * reply opens on "Let me put this together for you." Each sentence removed
 * must still match a class on its own; nothing is taken on momentum.
 */
const MAX_OPENER_SENTENCES = 2;

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

// D17 (ticket 7 task 12 item 1, the founder's call): invert applies to
// ENGLISH replies only. Georgian has no capital letters, so invert's
// "no content marker = drop" heuristic misfires on Georgian prose — a reply
// carrying any Georgian keeps the patterns behaviour even under
// OPENER_STRIP=invert.
const GEORGIAN_CHARS_RE = /[ა-ჿ]/u;

function effectiveMode(reply: string): OpenerMode {
  const mode = openerMode();
  if (mode === 'invert' && GEORGIAN_CHARS_RE.test(reply)) return 'patterns';
  return mode;
}

/**
 * Remove the reply's first sentence when it is contentless process talk.
 * Applied before the reply is persisted, so the stored text is clean too.
 */
export function stripProcessOpener(reply: string, threadId: number): string {
  const mode = effectiveMode(reply);
  if (mode === 'off') return reply;
  const trimmed = reply.trimStart();
  // Short or single-paragraph replies are never touched.
  if (trimmed.length < OPENER_MIN_REPLY_CHARS || !/\n/.test(trimmed)) return reply;

  let current = trimmed;
  for (let removed = 0; removed < MAX_OPENER_SENTENCES; removed++) {
    const verdict = firstSentenceVerdict(current, mode);
    if (verdict.kind === 'keep') {
      // Invert audits both directions: what it keeps is as informative as
      // what it drops. Only the untouched first sentence is worth logging.
      if (mode === 'invert' && removed === 0 && verdict.sentence !== null) {
        // eslint-disable-next-line no-console
        console.log(`[opener-keep] thread ${threadId}: "${verdict.sentence}"`);
      }
      break;
    }
    // eslint-disable-next-line no-console
    console.log(`[opener-strip] thread ${threadId}: "${verdict.sentence}"`);
    current = verdict.rest;
  }
  return current === trimmed ? reply : current;
}

type SentenceVerdict =
  | { kind: 'keep'; sentence: string | null }
  | { kind: 'strip'; sentence: string; rest: string };

/** Is the text's first sentence contentless process talk that can go? */
function firstSentenceVerdict(text: string, mode: OpenerMode): SentenceVerdict {
  const match = FIRST_SENTENCE_RE.exec(text);
  if (!match) return { kind: 'keep', sentence: null };
  const sentence = match[0];
  if (sentence.length > OPENER_MAX_SENTENCE_CHARS) return { kind: 'keep', sentence };
  // A digit means a finding, whatever the phrasing — always protected.
  if (/\d/.test(sentence)) return { kind: 'keep', sentence };

  const isProcessTalk = OPENER_PATTERNS.some((p) => p.test(sentence));
  const shouldStrip =
    mode === 'invert' ? isProcessTalk || !CONTENT_MARKERS.test(sentence) : isProcessTalk;
  if (!shouldStrip) return { kind: 'keep', sentence };

  const rest = text.slice(sentence.length).trimStart();
  // Never remove a sentence that IS the reply.
  if (rest.length === 0) return { kind: 'keep', sentence };
  return { kind: 'strip', sentence, rest };
}
