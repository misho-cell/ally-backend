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
// 2909 (box 54165, conv 50265): „talk to Levan's and Maia's assistants" — two go-betweens.
const PLAN_SENTENCE_RE =
  /(ასისტენტ(?:ს|ებს)\s+დაველაპარაკ\p{L}*|talk\s+to\s+(?:\S+\s+){1,6}?assistants?\b|поговорю\s+с\s+(?:\S+\s+){0,6}?ассистент|hablaré\s+con\s+(?:\S+\s+){0,6}?asistentes?\b)/iu;

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

/** The plan the server proposed: its own plan sentence and the go-betweens it names. */
export interface IntroPlan {
  readonly text: string;
  readonly names: readonly string[];
}

/** Shorter stems would match ordinary words. */
const MIN_NAME_STEM = 3;
const NOT_A_LETTER_RE = /[^\p{L}\s]/gu;
const FINAL_VOWEL_RE = /[აეიოუaeiouаеиоуыэюя]$/iu;

/** The first word of a name without its last vowel: „სანდრო" → „სანდრ", which „სანდროს" starts with. */
function nameStem(name: string): string {
  const first = name.replace(NOT_A_LETTER_RE, ' ').trim().split(/\s+/u)[0] ?? '';
  return first.replace(FINAL_VOWEL_RE, '').toLocaleLowerCase();
}

/** A clause break: a plan sentence with one before its verb carries more than the plan. */
const CLAUSE_BREAK_RE = /[,;:–—]/u;

/**
 * Is the sentence the plan alone — the go-between's name and then the verb
 * („სანდროს ასისტენტს…")? Run 3 opened with the name too, and explained the
 * match in a clause before the verb.
 */
function isThePlanAlone(sentence: string, names: readonly string[]): boolean {
  const verbAt = sentence.search(PLAN_SENTENCE_RE);
  if (verbAt < 0 || CLAUSE_BREAK_RE.test(sentence.slice(0, verbAt))) return false;
  const opening = sentence.trimStart().toLocaleLowerCase();
  return names
    .map(nameStem)
    .some((stem) => stem.length >= MIN_NAME_STEM && opening.startsWith(stem));
}

/**
 * 1454 (box 53296, 0 of 3 on 0165): three word-list rounds did not hold — each
 * run put a sentence before the plan in new words („…ჯერ ვერსად ვიპოვე…",
 * „…ნაპოვნია, ის ლიკას კონტაქტია.") or merged one into the plan sentence
 * („…პირდაპირი კონტაქტია და ქეთას იცნობს, მისი ასისტენტს დაველაპარაკები…").
 * D739: an introduction plan is its one sentence and one question.
 *
 * #6367 (Misho's yes, 24 Oct; tester 74815, 65093/65094): with that rule the
 * findings never showed — 18-20 searches and the owner read only „X-ის
 * ასისტენტს დაველაპარაკები… დავიწყო?". What the run found stays above the plan
 * now; a sentence that only justifies the match (two or more markers) still
 * goes, and so does a question before the plan. The plan itself is unchanged:
 * the model's own sentence when it is the plan alone, opening with the
 * go-between as the founder's example does, otherwise the server's. What
 * follows the plan sentence (the question) is left for the caller to settle.
 */
export function introPlanOnly(reply: string, plan: IntroPlan): string {
  const sentences = reply
    .split(/\n\s*\n/u)
    .flatMap((paragraph) => paragraph.split(SENTENCE_SPLIT_RE))
    .map((sentence) => sentence.trim());
  const own = sentences.find((sentence) => PLAN_SENTENCE_RE.test(sentence));
  const findings = findingsBefore(own === undefined ? reply : reply.slice(0, reply.indexOf(own)));
  const lead = findings === '' ? '' : `${findings}\n\n`;
  if (own === undefined) return `${lead}${plan.text}`;
  const after = reply.slice(reply.indexOf(own) + own.length);
  const keepOwn = isThePlanAlone(own, plan.names) && !carriesANote(plan.text);
  return `${lead}${keepOwn ? own : plan.text}${after}`;
}

/**
 * Not a finding: a stage direction about waiting or confirming („დამელოდე,
 * სანამ დაადასტურებ.", box 53461) or the reason asked for again (the English
 * reply's „…share why you would like to meet Bakhva…") — the plan asks those.
 */
const NOT_A_FINDING_RE =
  /დამელოდ|დაელოდ|დამიდასტურ|დაადასტურ|რატომ\s+გინდა|მიზეზ|\bwait\b|\bconfirm|\bwhy\s+you\b|\breason\b|подожд|подтверд|почему\s+ты|espera|confirma|por\s+qué/iu;
const HAS_A_WORD_RE = /\p{L}{2,}/u;

function isAFinding(sentence: string): boolean {
  return (
    HAS_A_WORD_RE.test(sentence) &&
    !sentence.endsWith('?') &&
    !NOT_A_FINDING_RE.test(sentence) &&
    !isAMatchJustification(sentence)
  );
}

/** #6367: what the run found, without match justifications, stage directions or questions. */
function findingsBefore(text: string): string {
  const paragraphs = text
    .split(/\n\s*\n/u)
    .map((paragraph) =>
      paragraph
        .split(SENTENCE_SPLIT_RE)
        .map((sentence) => sentence.trim())
        .filter(isAFinding)
        .join(' '),
    )
    .filter((paragraph) => paragraph !== '');
  return paragraphs.join('\n\n');
}

/** A bracketed note after a name: a tie (#5479) or something the owner must know first. */
const NOTE_RE = /\([^()]{3,}\)/u;

/**
 * #5479 (the tester's 65473, 0 of 6): the model's own plan sentence was kept and
 * the server's, which said why the bridge comes first, was not. A server
 * sentence with a note is the one the owner reads.
 */
function carriesANote(sentence: string): boolean {
  return NOTE_RE.test(sentence);
}
