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
/** An offer to call, asked: it is one only as a closing question. */
const CALL_OFFER_QUESTION_RE =
  /(დავურეკო|დავრეკო|\b(?:shall|should|can|may)\s+i\s+(?:call|phone|ring)\b|мне\s+позвонить|позвонить\s+мне|¿\s*(?:llamo|les?\s+llamo)\b)/iu;
/** A promise to call: one wherever it closes the reply. */
const CALL_PROMISE_RE =
  /(დავურეკავ|დავრეკავ|\bi(?:'ll|\s+will)\s+(?:call|phone|ring)\b|позвоню|\bllamaré\b)/iu;

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
  const closing = trimmed.slice(start);
  // The tester's 1137 (37101): „remind me to call Gela" — the reply's closing
  // line echoed the owner's own „…რომ გელას დავურეკო" and was read as an offer.
  // The asked form is an offer only when the sentence asks.
  const offers = /[?？]\s*$/u.test(closing) && CALL_OFFER_QUESTION_RE.test(closing);
  if (!offers && !CALL_PROMISE_RE.test(closing)) return text;
  const before = trimmed.slice(0, start).trimEnd();
  const line = CANNOT_CALL[language];
  return before === '' ? line : `${before}\n\n${line}`;
}

/**
 * The tester's 1133 (V9, 36568): the helper's screen showed the step
 * „ნოდარისთვის პასუხად ვგზავნი:" and nothing after the colon — the words it
 * introduced went into the tool call, not onto the screen — then the thanks
 * line as a second message. A step that is only a lead-in to something not
 * shown is not published.
 */
const DANGLING_LEAD_IN_RE = /[:：]\s*$/u;

export function withoutDanglingLeadIn(narration: string): string {
  return DANGLING_LEAD_IN_RE.test(narration) ? '' : narration;
}

/**
 * The tester's 1135 / board #830 (37066, 37070): a goal's reply said „მაკას
 * ვკითხავ ერთ მოკლე რეკომენდაციას: …" with the question quoted, and the run
 * had proposed no plan and sent nothing — the owner was told something was
 * happening and nothing was. A planless goal run that promises to ask or
 * write to someone is asked once to make the promise real (a plan with that
 * person, and its card) or to take it back. A question to the owner
 * („მივწეროთ?") is not a promise.
 */
// The tester's 1138 / #925 (37364, 37365, 37367, 37368): „არავის მივწერ" — „I
// write to NOBODY" — read as a promise, and the owner saw the correction turn.
// A negated verb promises nothing.
const PROMISES_TO_WRITE_RE =
  /(?<!(?:არავის|არავისთვის|არ|ვერ|ვერავის|not|never|nobody|no\s+one)\s+)(ვკითხავ|ვეკითხები|მივწერ(?!ო)|გავუგზავნი|\bi(?:'ll|\s+will)\s+(?:ask|write\s+to|message|reach\s+out\s+to)\b|спрошу|напишу)/iu;

export function promisesToWriteToSomeone(text: string): boolean {
  return PROMISES_TO_WRITE_RE.test(text);
}

export const PROMISED_ACTION_NUDGE =
  '(სისტემური შენიშვნა: შენ დაწერე, რომ ვინმეს ჰკითხავ ან მისწერ, მაგრამ ამ გაშვებაში არაფერი ' +
  'გაგზავნილა და ამ მიზანს გეგმა არ აქვს. თუ ამ ადამიანს უნდა მივწეროთ — ახლავე გამოიძახე ' +
  'propose_task_plan, ის people_to_involve-ში ჩაწერე და present_choices-ით შესთავაზე „ვამტკიცებ" ' +
  'და „შევცვალოთ". თუ არა — პასუხი ისე დაწერე, რომ არაფერს არ დაჰპირდე. მფლობელს შენი წინა ' +
  'ტექსტი არ უნახავს: პასუხი ერთხელ, თავიდან დაწერე, ბოდიშის გარეშე.)';

/**
 * The tester's 1137 (37036): „იურისტი მჭირდება… ვინ მყავს?" opened a goal, the
 * run called no tool, and the reply said „in this chat I cannot see your
 * network" and asked the owner for names. The wake thirty seconds later did
 * the real search. A run that opened a goal from a stated need and searched
 * nothing is asked once to search before it answers.
 */
export const SEARCH_FIRST_NUDGE =
  '(სისტემური შენიშვნა: ეს ახლახან გახსნილი მიზანია და ამ გაშვებაში არცერთი ძებნა არ გაგიკეთებია. ' +
  'მფლობელის ქსელზე წვდომა გაქვს ხელსაწყოებით — ახლავე მოძებნე (search_by_tag ორივე დამწერლობით, ' +
  'search_by_insight, search_second_degree) და პასუხი ნაპოვნიდან დაწერე. არ თქვა, რომ ქსელს ვერ ხედავ, ' +
  'და მფლობელს სახელები არ სთხოვო.)';

/**
 * #961 (the tester's 1137/1138, 37322): „გეგმის დასამტკიცებლად მითხარი: კი?" —
 * the reply asked the owner to approve a plan the run had never proposed, so
 * there was no card and a typed „კი" had nothing to approve.
 */
const ASKS_TO_APPROVE_A_PLAN_RE =
  /(გეგმ\S*\s+(?:დასამტკიცებლად|დაამტკიცე|დამტკიცება|ამტკიცებ)|(?:დაამტკიცე|დავამტკიცოთ|ვამტკიცებთ)\s+(?:ეს\s+)?გეგმა|\bapprove\s+(?:the|this|my)\s+plan\b|утверди(?:ть)?\s+план)/iu;

export function asksToApproveAPlan(text: string): boolean {
  return ASKS_TO_APPROVE_A_PLAN_RE.test(text);
}

/**
 * #960 (the tester's 1138/1142): the run's own search returned the owner's
 * contacts who are on Netai — the people Netai can ask directly — and the
 * reply offered web leads or an invitation and none of them. Asked once.
 */
export const MEMBERS_SKIPPED_NUDGE =
  '(სისტემური შენიშვნა: ამ გაშვებაში ძებნამ მფლობელის კონტაქტები იპოვა, რომლებიც Netai-ზე არიან ' +
  '(is_member: true) — მათ პირდაპირ ვკითხავთ. შენს პასუხში არცერთი არ ახსენე. შესთავაზე ისინი ' +
  '(გეგმაში people_to_involve) ან ერთი ხაზით თქვი, რატომ არ გამოდგებიან. მფლობელს შენი წინა ' +
  'ტექსტი არ უნახავს: პასუხი ერთხელ, თავიდან დაწერე, ბოდიშის გარეშე.)';

/**
 * The tester's 1142 (37517): the introduction request went out in the run
 * (the owner's „გამაცანი … მეშვეობით" was the consent) and the reply then
 * closed on „ნანას გავუგზავნო ეს თხოვნა?" — asking permission for what was
 * already done. A closing „send it?" in a run that sent the request is
 * replaced with what is true.
 */
const SEND_IT_QUESTION_RE =
  /(გავუგზავნო|გავაგზავნო|გავგზავნო|გავუგზავნოთ|გავაგზავნოთ|\b(?:shall|should|can)\s+i\s+send\b|отправить)/iu;

const REQUEST_WENT: Readonly<Record<RunLanguage, string>> = {
  ka: 'თხოვნა უკვე გაიგზავნა — როგორც კი უპასუხებენ, აქ გეტყვი.',
  en: 'The request has already gone — I will tell you here as soon as they answer.',
  ru: 'Просьба уже отправлена — как только ответят, скажу здесь.',
  es: 'La solicitud ya se envió — te aviso aquí en cuanto respondan.',
};

/** The reply with a closing „shall I send it?" replaced; unchanged otherwise. */
export function withoutSendItQuestion(text: string, language: RunLanguage): string {
  const trimmed = text.trimEnd();
  if (!/[?？]$/u.test(trimmed)) return text;
  const start = closingSentenceStart(trimmed);
  if (!SEND_IT_QUESTION_RE.test(trimmed.slice(start))) return text;
  const before = trimmed.slice(0, start).trimEnd();
  const line = REQUEST_WENT[language];
  return before === '' ? line : `${before}\n\n${line}`;
}

/**
 * #961 (the tester's 1142, 37604): the plan's only person is not on Netai, so
 * nothing can be sent today and the approve button is already taken off (row
 * 203) — and the reply still closed on „დავამტკიცოთ ეს გეგმა?". With no button
 * to answer it, the closing approval question goes too.
 */
export function withoutClosingApprovalAsk(text: string): string {
  const trimmed = text.trimEnd();
  if (!/[?？]$/u.test(trimmed)) return text;
  const start = closingSentenceStart(trimmed);
  if (!asksToApproveAPlan(trimmed.slice(start))) return text;
  const before = trimmed.slice(0, start).trimEnd();
  return before === '' ? text : before;
}

/**
 * #961 (37554): a button that offers to send to people — „კი, გაუგზავნე
 * სამივეს", „Send to all three" — is a request for the plan's yes. A negated
 * one („ჯერ არ გაუგზავნო") offers nothing.
 */
const OFFERS_TO_SEND_RE =
  /(?<!(?:არ|ნუ|don'?t|do\s+not)\s+)(გაუგზავნ|მისწერ|მიწერე|\bsend\s+(?:it\s+)?to\b|\bwrite\s+to\b)/iu;

export function offersToSend(label: string): boolean {
  return OFFERS_TO_SEND_RE.test(label);
}
