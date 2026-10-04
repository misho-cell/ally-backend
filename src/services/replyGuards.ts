import { RunLanguage } from './runLanguage';

// A run must end on an answer, not an announcement. These are the tails the
// battery kept catching as "half-finished narration marked final" (thread 5942
// + four cases on a second account): the model closes its turn with "now let's
// see…" and no tool call, so the run completes normally with a cliffhanger.
// The seat-14 tester (4 Oct, 36433): „ცოცხალ ამინდს ახლა ვერ ვამოწმებ" — „I
// CANNOT check the weather" — read as „I am checking", and the nudge's answer
// went to the owner. A negated verb is a refusal, not an announcement.
const CLIFFHANGER_TAIL_RE =
  /(?<!(?:ვერ|არ|can'?t|cannot|won'?t|not)\s+)(?:ვნახოთ|ვნახავ|შევამოწმებ|გადავამოწმებ|მოვძებნი|ვამოწმებ|ვეძებ|ერთი წუთით|ერთი წამით|let me (?:check|look|see|search)|i'?ll (?:check|look|search)|checking|one moment)[^?]{0,60}$/i;

// A long final is a real answer even if it mentions next steps; only short
// finals can BE the cliffhanger.
const MAX_CLIFFHANGER_FINAL_CHARS = 400;

export function isCliffhangerReply(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_CLIFFHANGER_FINAL_CHARS) return false;
  if (/[?？]\s*$/.test(trimmed)) return false; // a question to the user is a valid ending
  return CLIFFHANGER_TAIL_RE.test(trimmed.slice(-160));
}

export const CLIFFHANGER_NUDGE =
  '(სისტემური შენიშვნა: მოკლედ აცნობე მომხმარებელს სად ხარ და რა გაქვს უკვე ნაპოვნი. ' +
  'თუ საქმე დაუსრულებელია და წინსვლა შეგიძლია — განაგრძე ახლავე: გამოიძახე საჭირო ხელსაწყო. ' +
  'თუ საქმე დასრულდა — ჩამოაყალიბე საბოლოო პასუხი; რაც ვერ მოიძებნა, პირდაპირ თქვი.)';

/**
 * Ticket 20 row 126 — a task_step run that ends leaving the goal planless.
 *
 * The tester's PR1 run, 16 September. Four of five fresh goals proposed their
 * plan in the run that saved them (row 101). The fifth, goal 3598, did not:
 * ensureGoalForRequest had opened it BEFORE the run started, so create_task
 * was never called and row 101's instruction — which lives in create_task's
 * RESULT — never reached it. That run searched for 107 seconds and answered
 * with no plan; the delayed engine turn then proposed it four seconds later,
 * in a second message.
 *
 * The task-engine section of the prompt ALREADY says „გეგმა ჯერ არ არის.
 * პირველი ნაბიჯი: propose_task_plan-ით შესთავაზე". It said so during that
 * run. This is the lesson G6 and row 117 both wrote down — a sentence in a
 * prompt is not a wall — so the answer is not a better sentence. The run is
 * checked against the goal's actual state and asked once more, with the tools
 * still in its hand.
 *
 * The delayed engine turn stays exactly where it is. It already refuses to
 * fire when a plan exists, so a nudge that works leaves it nothing to do
 * rather than racing it — the same arrangement row 101 chose.
 */
export const MISSING_PLAN_NUDGE =
  '(სისტემური შენიშვნა: ამ მიზანს გეგმა ჯერ არ აქვს, შენი პასუხი კი უკვე დაიწერა. ' +
  'ახლავე გამოიძახე propose_task_plan — რა ჩაითვლება მოგვარებულად, რა გზებით მიდიხარ, ' +
  'ვის ეკითხები (ტელეფონის id ძიების შედეგიდან), ვის არასდროს — და ბოლოს present_choices-ით ' +
  'ორი ღილაკი: „დამტკიცებულია" და „შევცვალოთ". პასუხი აღარ გაიმეორო: მხოლოდ გეგმა და ღილაკები. ' +
  'თუ მფლობელმა თქვა, რომ არავის არ მივწეროთ — people_to_involve ცარიელი რჩება.)';

// The final message claiming NOTHING was found while a tool round returned
// results (battery case 8: steps named 23 people, the final said none exist).
// Only a short final can be a blanket not-found claim — a long answer that
// merely says "couldn't find MORE" must not trigger.
const NOT_FOUND_CLAIM_RE =
  /ვერ (?:ვიპოვე|მოიძებნა|ვნახე|იძებნება)|ვერაფერი (?:ვიპოვე|მოიძებნა)|არ (?:მოიძებნა|ჩანს შედეგები)|couldn'?t find|could not find|no (?:results|matches|one) (?:found|matched)|nothing (?:found|matched)/i;
const MAX_NOT_FOUND_CLAIM_CHARS = 600;

export function claimsNothingFound(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_NOT_FOUND_CLAIM_CHARS) return false;
  return NOT_FOUND_CLAIM_RE.test(trimmed);
}

/**
 * ROW 273's MISSING HALF — what the nudge actually bought, in one line.
 *
 * ⚠️ WHY THIS EXISTS. The guard fires 153 times a week (measured 26 September,
 * from the nudge turns the run persists). What is NOT known is how many of
 * those carried real work forward and how many only said the same thing twice,
 * and until that is known the fix cannot be chosen: exempting the wrong tails
 * would delete a guard built from five real cases.
 *
 * ⚠️ AND THE OBVIOUS MEASUREMENT DOES NOT WORK. The nudge row is written to
 * the database at the END of a run together with every other pending turn, so
 * its timestamp sits after the last tool call by construction — „tool calls
 * after this moment" can only ever be zero. I ran that query, got a confident
 * 141 of 153, and threw it away. The facts have to be recorded while the run
 * still has them, which is here.
 *
 * WHAT IS RECORDED, and each one is a fact rather than a verdict:
 *
 *   tools   tool calls made DURING the continuation. Zero means the nudge
 *           produced words only — which is not yet proof of repetition.
 *   said    characters of the announcement that tripped the guard.
 *   then    characters the continuation added.
 *   echo    the share of the continuation's words that were already in the
 *           announcement. NOT a similarity score and not a verdict: a high
 *           echo on two short lines can be innocent, and this number exists
 *           to be read beside the other three, never alone.
 *
 * NOTHING OF WHAT WAS SAID IS LOGGED — lengths and a ratio, no text. A
 * person's sentence in a log is the same mistake as their phone number in one.
 */
function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2);
}

/** The share of the continuation's words the announcement already said; null when it has none. */
export function cliffhangerEcho(announcement: string, continuation: string): number | null {
  const before = new Set(significantWords(announcement));
  const after = significantWords(continuation);
  if (after.length === 0) return null;
  return after.filter((w) => before.has(w)).length / after.length;
}

export function describeCliffhangerOutcome(
  announcement: string,
  continuation: string,
  toolCallsDuring: number,
): string {
  const share = cliffhangerEcho(announcement, continuation);
  // No words is not a zero echo, it is nothing to measure.
  const echo = share === null ? 'n/a' : `${Math.round(share * 100)}%`;
  return (
    `tools=${toolCallsDuring} said=${announcement.trim().length} ` +
    `then=${continuation.trim().length} echo=${echo}`
  );
}

/**
 * Row 273, measured over the week the instrumentation ran (27 Sep – 4 Oct, all
 * 333 deployments, 172 nudged continuations): 120 did no tool work, but most of
 * those wrote something new (91 under half echo). The harm is the narrow group
 * that did no work AND mostly said the announcement again — 18 at 75% echo or
 * more — where the owner read the same thing twice in one message. There, the
 * continuation replaces the announcement instead of following it.
 */
const REPEAT_ECHO_SHARE = 0.75;

export function continuationRepeatsAnnouncement(
  announcement: string,
  continuation: string,
  toolCallsDuring: number,
): boolean {
  if (toolCallsDuring > 0) return false;
  const share = cliffhangerEcho(announcement, continuation);
  return share !== null && share >= REPEAT_ECHO_SHARE;
}

/**
 * The tester's 1100 (round 5, conversation 32753): in an incoming-ask thread
 * the helper typed a question back for the asker, and his assistant answered
 * „I passed it to her, the answer will come here" with no tool call. Nothing
 * reached the asker. The only channel back is send_answer_to_asker (D48: only
 * words the helper approved, through the tool), so the server never relays the
 * line itself; it catches the claim and asks the model once more.
 */
// The tester's 1105 (33298): „გადასაცემი პასუხი: ჯემალ ფირცხალავა." — the
// answer labelled as passed on, with no send, is the same claim.
// The tester's 1102 (i, 33119): „ქეთევანს ჰკითხე: რატომ სჭირდება…" — the
// helper's question written as an instruction to ask, and never sent.
const CLAIMS_PASSED_ON_RE =
  /(ჰკითხე\s*[:：]|\bask\s+\p{L}+\s*:|გადასაცემი\s+პასუხი|გასაგზავნი\s+პასუხი|answer\s+to\s+(?:pass\s+on|send|relay)\s*:|გადავეცი|გავუგზავნე|გავაგზავნე|მივწერე|გადავუგზავნე|ვუთხარი\s+(მას|მის)|i(?:'ve| have)?\s+(?:passed|sent|forwarded|relayed)\b|i\s+told\s+(?:her|him|them)\b|передал|отправил)/iu;

export function claimsToHavePassedItOn(text: string): boolean {
  return CLAIMS_PASSED_ON_RE.test(text);
}

export const PASSED_ON_NUDGE =
  '(სისტემური შენიშვნა: შენ დაწერე, რომ კითხვის ავტორს გადაეცი, მაგრამ ამ გაშვებაში ' +
  'send_answer_to_asker არ გამოგიძახებია და მას არაფერი მისვლია. თუ მომხმარებლის სიტყვები მისთვისაა, ' +
  'ახლავე გაგზავნე send_answer_to_asker-ით, confirmed=true, ზუსტად მისი სიტყვებით. თუ არა — ' +
  'მოკლედ უთხარი, რომ ჯერ არაფერი გაგზავნილა.)';

/**
 * The tester's 1110 (33950): the helper typed „რატომ სჭირდება? რაზე მუშაობს?",
 * the run called no tool, and the reply said „your question could not be sent".
 * The claim guard reads the model's wording, and the wording keeps changing. A
 * helper's own line that is a question, in a run that sent nothing, is asked
 * about directly: if it is for the asker, it goes to them in their words.
 */
const QUESTION_LINE_RE = /[?？]\s*$/u;

export function helperAskedAQuestion(helperLine: string): boolean {
  return QUESTION_LINE_RE.test(helperLine.trim());
}

export const HELPER_QUESTION_NUDGE =
  '(სისტემური შენიშვნა: მომხმარებელმა კითხვა დაწერა და ამ გაშვებაში არაფერი გაგზავნილა. თუ ეს ' +
  'კითხვა კითხვის ავტორს ეკუთვნის — მაგალითად, რისთვის სჭირდება, ან ვინ არის — ახლავე ' +
  'გაგზავნე send_answer_to_asker-ით, confirmed=true, ზუსტად მისი სიტყვებით, და მოკლედ უთხარი, ' +
  'რომ გადაეცი. თუ კითხვა შენთვისაა, უპასუხე თავად.)';

/**
 * The tester's 1133 (V1, 36539): the reply listed three plumbers with their
 * phones and closed on „გინდა, რომელიმეს დავურეკო დღესვე?" — Netai cannot
 * place a call. A closing sentence that offers one is replaced with what is
 * true: the numbers are above, and the owner calls.
 */
const CALL_OFFER_RE =
  /(დავურეკო|დავრეკო|დავურეკავ|დავრეკავ|\b(?:shall|should|can|may)\s+i\s+(?:call|phone|ring)\b|\bi(?:'ll|\s+will)\s+(?:call|phone|ring)\b|позвоню|мне\s+позвонить|позвонить\s+мне|¿\s*(?:llamo|les?\s+llamo)\b|\bllamaré\b)/iu;

const CANNOT_CALL: Readonly<Record<RunLanguage, string>> = {
  ka: 'დარეკვა ჩემგან არ შეიძლება — ტელეფონები ზემოთაა და შეგიძლია თვითონ დაუკავშირდე.',
  en: 'I cannot place calls myself — the numbers are above, so you can call them directly.',
  ru: 'Звонить сам я не могу — номера выше, ты можешь связаться с ними напрямую.',
  es: 'No puedo hacer llamadas — los números están arriba y puedes llamarlos tú.',
};

const CLOSING_SENTENCE_ENDS: readonly string[] = ['.', '!', '?', '\n'];

/** Where the reply's last sentence begins. */
function closingSentenceStart(text: string): number {
  const body = text.slice(0, -1);
  return Math.max(...CLOSING_SENTENCE_ENDS.map((end) => body.lastIndexOf(end))) + 1;
}

/** The reply with a closing offer to place a call replaced; unchanged otherwise. */
export function withoutCallOffer(text: string, language: RunLanguage): string {
  const trimmed = text.trimEnd();
  const start = closingSentenceStart(trimmed);
  if (!CALL_OFFER_RE.test(trimmed.slice(start))) return text;
  const before = trimmed.slice(0, start).trimEnd();
  const line = CANNOT_CALL[language];
  return before === '' ? line : `${before}\n\n${line}`;
}
