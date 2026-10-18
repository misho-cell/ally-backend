/**
 * #4886 (the tester's AFTER runs 58908, 58910, 58911, 18 Oct; option A, the
 * founder's pick put to him in box 67090, Misho's „კველაფერზე კი"): asked
 * „გიორგი რა შუაშია?" about someone the last reply named, the answer ran two to
 * five sentences in all three runs, though the prompt says one (D809). So when
 * the owner's whole message asks why about a person the last reply named, the
 * server keeps the reply's first sentence. Nothing is written; it only cuts.
 */
const MAX_WHY_QUESTION_CHARS = 60;
const WHY_RE =
  /(?:^|\s)(?:რატომ|რისთვის|რად)(?:\s|$)|რა\s+შუაშია|რა\s+შუაში|\bwhy\b|what\s+does\s+\S+\s+have\s+to\s+do/iu;
const WORD_RE = /[\p{L}]{3,}/gu;
/** A name is matched by the start of a word, so any case ending still matches. */
const NAME_STEM_CHARS = 4;
const QUESTION_WORDS: ReadonlySet<string> = new Set([
  'რატო',
  'რისთ',
  'შუაშ',
  'why',
  'what',
  'does',
  'have',
  'with',
  'him',
  'her',
  'them',
]);
const FIRST_SENTENCE_RE = /^[^.!?…\n]+[.!?…]*/u;

function stemsOf(text: string): string[] {
  return (text.match(WORD_RE) ?? [])
    .map((word) => word.slice(0, NAME_STEM_CHARS).toLowerCase())
    .filter((stem) => !QUESTION_WORDS.has(stem));
}

/** Is the owner's whole message a short „why"? */
export function isShortWhy(ownerLine: string): boolean {
  const line = ownerLine.trim();
  return line !== '' && line.length <= MAX_WHY_QUESTION_CHARS && WHY_RE.test(line);
}

/** Does the owner's whole message ask why about someone the last reply named? */
export function asksWhyAboutNamed(ownerLine: string, earlierReply: string | null): boolean {
  if (earlierReply === null || !isShortWhy(ownerLine)) return false;
  const line = ownerLine.trim();
  const earlier = earlierReply.toLowerCase();
  return stemsOf(line).some((stem) => earlier.includes(stem));
}

/** Only the reply's first sentence; the reply itself when it has one sentence. */
export function firstSentenceOnly(reply: string): string {
  const first = FIRST_SENTENCE_RE.exec(reply.trim())?.[0]?.trim() ?? '';
  return first === '' ? reply : first;
}
