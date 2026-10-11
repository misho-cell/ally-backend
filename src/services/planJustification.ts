/**
 * 1454 / D739 (the founder, 9 Oct 00:59 Tbilisi): the introduction plan is one
 * human sentence and one question — „ბახვას ასისტენტს დაველაპარაკები და
 * შევეცდები მოვაგვარო, რომ ბახვამ გაგაცნოთ თამთა. დავიწყო?" — but 1 run of 3
 * put a sentence in front of it explaining the match: „ბახვა შენი პირდაპირი
 * კონტაქტია და ნეტაიზე წევრია, და ის იცნობს თამთას, ეს ზუსტად ემთხვევა შენს
 * თხოვნას." That sentence goes.
 *
 * Narrow on purpose: a plan reply may lead with real news (the tester's 1110),
 * so only a sentence BEFORE the plan sentence that reads as a match
 * justification — two or more of its markers — is dropped.
 */

/** The plan sentence: the assistant talking to another assistant. */
// 1454 (box 53065, run 1): „…ასისტენტს დაველაპარაკო" — every form of the verb counts.
const PLAN_SENTENCE_RE =
  /(ასისტენტ(?:ს|ებს)\s+დაველაპარაკ\p{L}*|talk\s+to\s+\S+\s+assistant|поговорю\s+с\s+ассистент|hablaré\s+con\s+(?:el|la)\s+asistente)/iu;

/** 48247: does this text carry the plan sentence? */
export function carriesPlanSentence(text: string): boolean {
  return PLAN_SENTENCE_RE.test(text);
}

/** What a match justification says: contact, member, bridge, knows, matches, the way through. */
const JUSTIFICATION_MARKERS: readonly RegExp[] = [
  /პირდაპირი\s+კონტაქტ|შენი\s+კონტაქტ|direct\s+contact|your\s+contact|прямой\s+контакт|tu\s+contacto/iu,
  /ნეტაიზე|ნეტაის|ნეტაი-ს|netai-ს|წევრია|წევრი\s+არის|on\s+netai|uses\s+netai|netai\s+member|member\s+of\s+netai|в\s+netai|en\s+netai/iu,
  // 1454 (owner 182501): „…ერთადერთი ხიდი სწორედ ბახვაა…", „მეორე წრის კონტაქტია".
  /ხიდ|მეორე\s+წრ|bridge|second\s+circle|мост|puente/iu,
  // 1454 (box 53133, runs 2 and 3): „…ლიკა ნაგონის მეშვეობით ვიცნობ…" — every form of „know".
  /იცნობ|\bknow|знает|знаю|conoce|conozco/iu,
  /ემთხვევა|matches|соответствует|coincide/iu,
  // 1454 (box 53133): how the person is reached — „მეშვეობით", „ქსელში ნაპოვნია", „პირდაპირ იცნობს".
  /მეშვეობით|გავლით|ქსელში|პირდაპირ(?!ი\s+კონტაქტ)|\bthrough\b|\bvia\b|in\s+your\s+network|через|в\s+(?:твоей\s+)?сети|a\s+través\s+de|en\s+tu\s+red/iu,
];

const MIN_MARKERS = 2;
const SENTENCE_SPLIT_RE = /(?<=[.!?…])\s+/u;

function isAMatchJustification(sentence: string): boolean {
  return JUSTIFICATION_MARKERS.filter((marker) => marker.test(sentence)).length >= MIN_MARKERS;
}

/** One paragraph without the justification sentences that come before its plan sentence. */
function paragraphWithoutJustification(paragraph: string): string {
  const sentences = paragraph.split(SENTENCE_SPLIT_RE);
  const planAt = sentences.findIndex((sentence) => PLAN_SENTENCE_RE.test(sentence));
  const end = planAt < 0 ? sentences.length : planAt;
  if (end === 0) return paragraph;
  const before = sentences.slice(0, end).filter((s) => !isAMatchJustification(s));
  return [...before, ...sentences.slice(end)].join(' ');
}

/**
 * The plan reply without a match-justifying sentence ahead of the plan
 * sentence. Every other sentence, and a reply with no plan sentence, is left
 * exactly as written.
 */
export function withoutMatchJustification(reply: string): string {
  if (!PLAN_SENTENCE_RE.test(reply)) return reply;
  const paragraphs = reply.split(/\n\s*\n/u);
  const planParagraph = paragraphs.findIndex((p) => PLAN_SENTENCE_RE.test(p));
  const kept = paragraphs
    .map((paragraph, i) => {
      if (i > planParagraph) return paragraph;
      return paragraphWithoutJustification(paragraph);
    })
    .filter((paragraph) => paragraph.trim() !== '');
  return kept.join('\n\n');
}

/**
 * 1454 (the tester's 50625, owner 182501, 08:02Z): the reply had no plan
 * sentence at all — only the match justification („ვიპოვე გზა: … ბახვა …
 * შენი პირდაპირი კონტაქტია და თავად იყენებს ნეტაის.") and „დავიწყო?". It ended
 * on the plan question, so it counted as carrying the plan, and the filter
 * above keys on a plan sentence it did not have. When the server's own plan
 * sentence exists and the reply lacks one, the justification goes and the
 * server's sentence stands in its place; any other news stays first, and the
 * closing question is put back by the caller.
 */
export function withPlanSentence(reply: string, planText: string): string {
  if (carriesPlanSentence(reply) || !carriesPlanSentence(planText)) return reply;
  const sentences = reply
    .split(/\n\s*\n/u)
    .flatMap((paragraph) => paragraph.split(SENTENCE_SPLIT_RE))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '' && !isAMatchJustification(sentence));
  const last = sentences[sentences.length - 1];
  const news = last !== undefined && last.endsWith('?') ? sentences.slice(0, -1) : sentences;
  return news.length === 0 ? planText : `${news.join(' ')}\n\n${planText}`;
}

/**
 * 1454 (box 52940, run 3): the reply carried the plan twice — the model's own
 * „სანდროს ასისტენტს დაველაპარაკები და შევეცდები მოვაგვარო, რომ სანდრომ
 * გაგაცნოს ქეთა." and then the server's sentence it was handed. The plan is
 * one sentence (D739): the first one stays, every later plan sentence goes,
 * and nothing else is touched.
 */
export function withOnePlanSentence(reply: string): string {
  let seen = false;
  return reply
    .split(/\n\s*\n/u)
    .map((paragraph) =>
      paragraph
        .split(SENTENCE_SPLIT_RE)
        .filter((sentence) => {
          if (!PLAN_SENTENCE_RE.test(sentence)) return true;
          if (seen) return false;
          seen = true;
          return true;
        })
        .join(' '),
    )
    .filter((paragraph) => paragraph.trim() !== '')
    .join('\n\n');
}
