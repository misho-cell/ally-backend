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
 * 0266 part 1 (the tester's 58043, run 51403): „სთხოვე ზურაბს, დამაკავშიროს
 * თამართან" was answered „…მივწერო ზურაბს და სთხოვო, დაგაკავშიროთ?" and nothing
 * went. A question back after an introduction instruction is let stand when it
 * asks for the REASON (3697); one asking LEAVE to send is not a real question,
 * because the typed instruction is itself that yes (CF, §139). 58066 (run 51426):
 * the present tense asks it too — „ვუგზავნი ზურაბს გაცნობის თხოვნას …?".
 */
const ASKS_LEAVE_TO_SEND_RE =
  /(?:მივწერო|მივწერ|გავუგზავნო|გავაგზავნო|ვუგზავნი|გავუგზავნი|ვუგზავნო|ვწერ|ვთხოვო|ვთხოვ|ვკითხო|მივმართო|დავუკავშირდე)(?!\p{L})|\b(?:shall|should)\s+i\s+(?:send|write|ask|message|contact)\b|\b(?:want|like)\s+me\s+to\s+(?:send|write|ask|message|contact)\b|(?:написать|отправить|попросить)\s+(?:ему|ей|им)?\s*\?|(?:quieres|deseas)\s+que\s+(?:le\s+)?(?:escriba|envíe|pida)/iu;

/** True when the reply's last question asks the owner for leave to send. */
export function asksLeaveToSend(reply: string): boolean {
  const questions = reply.match(/[^.!?？\n]*[?？]/gu) ?? [];
  const last = questions[questions.length - 1] ?? '';
  return ASKS_LEAVE_TO_SEND_RE.test(last);
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

/**
 * 4655 rebuilt (the tester's 55954 and 56014): „გელას ჰკითხე, ხომ არ იცის კარგი
 * სანტექნიკოსი, და ლევანს სთხოვე, გამაცნოს ნინო." is one sentence holding two
 * requests. Split on a comma with „და"/„ასევე"/„and"/„also", or a semicolon,
 * Gela's part is a question — but 0226 split it alone and Gela's one message
 * then carried Levan's introduction too, so it was reverted. The split now
 * comes only together with the own-part check (ownPart.ts), behind one switch:
 * ON since Misho's yes on that check's refusal sentence (CG), 13 Oct 11:2x UTC
 * in the operations chat, „ჩემგან ყველაფერზე კია" (§139).
 */
// OFF (D710) 13 Oct 14:1xZ, then ON again 14 Oct: the tester's 56802 found Gela's
// message carrying Levan's introduction 2 of 2, but that message was never the
// model's. task_asks shows it written 1–2 s after the owner's line, by the server's
// own send (instructedAsk), which took the whole rest of the sentence. That path
// has sent nothing for a sentence holding an introduction since 0256. This check
// catches both of 56802's messages. With it off, the question to Gela is refused
// as an introduction, so 4655 can only pass with it on.
export const OWN_PART_ONLY_ON = true;
const PART_BREAK_RE = /;\s*|,\s*(?:და|ასევე|and|also)\s+/iu;

/** The owner's words cut into each person's part (sentences, and parts when split). */
export function partsOf(
  lines: readonly string[],
  splitParts: boolean = OWN_PART_ONLY_ON,
): string[] {
  return lines
    .flatMap((line) => line.match(SENTENCE_RE) ?? [])
    .flatMap((sentence) => (splitParts ? sentence.split(PART_BREAK_RE) : [sentence]))
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The first name's stem, as askIsTheIntroduction reads it; null for a short or empty name. */
export function nameStemOf(name: string): string | null {
  return nameStem(name);
}

/**
 * Is this ask the introduction the owner asked for? The newest sentence of the
 * owner's that names the recipient decides; when none names them (or the name
 * is too short to read), the owner's introduction stands.
 */
export function askIsTheIntroduction(
  ownerLines: readonly string[],
  recipientName: string,
  splitParts: boolean = OWN_PART_ONLY_ON,
): boolean {
  if (!ownerAsksForIntroduction(ownerLines)) return false;
  const stem = nameStem(recipientName);
  if (stem === null) return true;
  const sentences = partsOf(ownerLines, splitParts);
  const named = sentences.filter((s) => s.toLowerCase().includes(stem));
  if (named.length === 0) return true;
  // #6361 (Giorgi, goal 29308): „ask Lika whether she has any news" was refused
  // as an introduction because an EARLIER line had asked Lika to introduce him.
  // The owner's newest words about this person decide what this ask is.
  return OWNER_INTRO_RE.test(named[named.length - 1]);
}

export const USE_INTRODUCTION_REFUSAL =
  'Not sent: the owner asked to be INTRODUCED to someone — that is an introduction, not a ' +
  'question. Call request_introduction instead: the person who knows them is the go-between, ' +
  'the person the owner wants to meet is the target. Do not tell the owner about this refusal; ' +
  'make the introduction request now.';
