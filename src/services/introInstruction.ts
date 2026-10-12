/**
 * T2479 (§98.3; the MASTER TEST RUN's IN-002 / PR-007): „გამაცანი თამთა
 * გამოგონილი, ბახვა გამოგონილი იცნობს." + „ვადასტურებ" — the owner asked to be
 * INTRODUCED, and the run sent the go-between a plain question with ask_contact.
 * An introduction goes through request_introduction: the person asked gets the
 * introduction card, and a yes connects the two.
 *
 * Only the imperative to Netai counts. Case 1's „გამაცნობს თუ არა" asks the
 * helper whether HE will introduce — that is a question, and stays one.
 * 3697: „სთხოვე მაიას, გამაცნოს ბახვა" (ask Maia to introduce me) is the
 * same request through a named go-between, and is one.
 * 2311 (box 54162): „სთხოვე ლევანს, დამაკავშიროს თამთასთან", „შემაერთოს" and
 * „მაიას თხოვე ბახვასთან დაკავშირება" are the same request; „შემაერთებს თუ არა"
 * stays a question, like Case 1's „გამაცნობს თუ არა".
 */
const OWNER_INTRO_RE =
  /((?:გამაცანი|დამაკავშირე|გამაცნოს|გაგვაცნოს|დამაკავშიროს|დაგვაკავშიროს|შემაერთე|შემაერთოს|შეგვაერთოს)(?!\p{L})|\S+თან\s+(?:დაკავშირება|გაცნობა)|\bintroduce\s+(?:me|us)\s+to\b|\bconnect\s+me\s+(?:with|to)\b|познакомь\s+меня|preséntame)/iu;

/** True when one of the owner's lines on this goal tells Netai to introduce them. */
export function ownerAsksForIntroduction(ownerLines: readonly string[]): boolean {
  return ownerLines.some((line) => OWNER_INTRO_RE.test(line));
}

/**
 * Box 54175 (4258's run, conv 50292): „სთხოვე ნინოს, გამაცნოს რეზო. ასევე
 * ჰკითხე გელას, ხომ არ იცნობს სხვა ინვესტორს." — one introduction AND one plain
 * question. The guard read the whole message, refused the question to Gela three
 * times, and it went out as a broken introduction. Each person's part is judged
 * on its own: a question to someone the owner named only outside every
 * introduction sentence is a question.
 */
const SENTENCE_RE = /[^.!?。]+[.!?。]?/gu;
const MIN_STEM_CHARS = 3;
const GEORGIAN_LETTER_RE = /\p{Script=Georgian}/u;

/** The first name as it is found in any case form: „გელა" is in „გელას", „Gela" in „Gela's". */
function nameStem(name: string): string | null {
  const first = name.trim().split(/\s+/u)[0]?.toLowerCase() ?? '';
  if (first.length < MIN_STEM_CHARS) return null;
  const stem =
    GEORGIAN_LETTER_RE.test(first) && first.length > MIN_STEM_CHARS ? first.slice(0, -1) : first;
  return stem.length >= MIN_STEM_CHARS ? stem : null;
}

function sentencesOf(lines: readonly string[]): string[] {
  return lines
    .flatMap((line) => line.match(SENTENCE_RE) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Is this ask the introduction the owner asked for? True unless the recipient is
 * named in the owner's words only outside the introduction sentences — when that
 * cannot be told (no name, a name in both), the owner's introduction stands.
 */
export function askIsTheIntroduction(
  ownerLines: readonly string[],
  recipientName: string,
): boolean {
  if (!ownerAsksForIntroduction(ownerLines)) return false;
  const stem = nameStem(recipientName);
  if (stem === null) return true;
  const sentences = sentencesOf(ownerLines);
  const named = sentences.filter((s) => s.toLowerCase().includes(stem));
  if (named.length === 0) return true;
  return named.some((s) => OWNER_INTRO_RE.test(s));
}

export const USE_INTRODUCTION_REFUSAL =
  'Not sent: the owner asked to be INTRODUCED to someone — that is an introduction, not a ' +
  'question. Call request_introduction instead: the person who knows them is the go-between, ' +
  'the person the owner wants to meet is the target. Do not tell the owner about this refusal; ' +
  'make the introduction request now.';
