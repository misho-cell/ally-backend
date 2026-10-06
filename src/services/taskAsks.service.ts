import { ALREADY_ON_CARD } from './answerCardGuard';
import { missingFacts, missingFactsRefusal } from './answerFacts';
import { sentenceCarriedOver } from './sentenceCarriedOver';
import {
  factsAdded,
  factsAddedRefusal,
  firstPersonCarried,
  firstPersonRefusal,
  endorsementAdded,
  endorsementAddedRefusal,
} from './helpersVoice';
import { ruleAnswerInOwnWords } from './ruleAnswerWording.service';
import { labelNamedIn } from './namedLabel';
import { holdAsk, releaseHeldAsk } from './heldAsks.service';
import { BridgeNeed, BridgePicker, bridgePicker } from './bridgePicker';
import { recommendedByLine, recommenderFor } from './recommendedBy';
import { query } from '../db/postgres/client';
import { getTaskById, wakeTaskNoLaterThan } from './taskStore.service';
import { acceptedIntroductionPhones, planAllows, planInForce, TaskPlan } from './taskPlans.service';
import { AnswerRule, matchAnswerRule, recordRuleUse, saveAnswerRule } from './answerRules.service';
import { sharedRoster } from './roster.service';
import { phoneDigits } from './phone';
import { looksLikeContactInstruction } from './goalIntent';
import { questionForReader } from './askTranslation.service';
import {
  createThread,
  lastAssistantMessageIs,
  saveThreadMessage,
  threadLanguage,
  userLanguage,
} from './threads.service';
import {
  askAnsweredAndGoalClosed,
  askWithdrawnAfterOptOut,
  RunLanguage,
  RUN_STRINGS,
} from './runLanguage';
import { emitThreadCreated } from './sse.service';
import { sendPushNotification } from './notification.service';
import { ALLOW_OPEN, allowedSpansForTheModel, scrubText } from './privacyScrub';
import { receivingCapsAreOff } from './askCapExemptions';
import { geoName } from './georgianCase';
import {
  answeredByYourRule,
  askCancelledNote,
  bridgeThanks,
  buildAskOpening,
  askChoices,
  AskTap,
  askTapLineForAsker,
  askTapOf,
  isDeclineChoice,
  unknownSenderName,
} from './askOpening';
import { findContactPhonesByName } from './tools/nameMatch';
import { isOptedOutFromAsks } from './askOptOut.service';
import { askBoundaryBlocks } from './askBoundary.service';
import { isPhoneOptedOut } from './privacyRights.service';
import {
  checkAskBudget,
  checkFollowUpBudget,
  GrowthAskRefusalReason,
  RELAY_MESSAGES_PER_PERSON_PER_DAY,
} from './askBudget.service';
import { setThreadStatus } from './threadStatus.service';
import { armAskDebrief } from './debrief.service';
import { recordMutualWarmth } from './warmth.service';
import { AskState, LATER_DEFAULT_DAYS, ownerAskLine } from './askState';
import { isTypedLater, LATER_UNTIL_SQL } from './laterChoices';
import { noteWaveAsk, waveRoomFor } from './askWaves.service';
import {
  ASKED_AS_THE_ASKER_SAVED_THEM,
  ASKER_AS_THE_READER_SAVED_THEM,
  nameAsSavedBySql,
} from './savedNameSql';

const ASK_QUERY_TIMEOUT_MS = 8_000;
/**
 * How long a phonebook label has to be before the owner naming it counts.
 *
 * Short labels are where a wrong recipient comes from: „ana" sits inside
 * „Anano", „ia" inside half the language. Four characters is not a rule about
 * names, it is a floor under how much evidence a substring match is allowed to
 * be — and a label shorter than this simply falls back to the plan's yes.
 */
const MIN_NAMED_LABEL_CHARS = 4;
/** Enough labels to judge one sentence by; a sentence names one or two people. */
const MAX_NAMED_LABEL_CANDIDATES = 20;
/**
 * How far before the goal's creation the owner's typed line may be. The line is
 * saved before the run that opens the goal, and a run with web searches can
 * take minutes.
 */
const TYPED_LINE_GRACE_MINUTES = 15;
// The recipient's chat list must distinguish eight questions from the same
// sender — the title carries the question itself, not a generic "კითხვა".
const ASK_TITLE_SNIPPET_CHARS = 48;
// Belt-and-braces for the title only (ticket 4 item 3): when every ask opens
// "გამარჯობა ლიკა!", every row in her list reads the same. The greeting is
// stripped from the TITLE; the message itself is delivered exactly as the
// sender wrote it. Punctuation is required after the greeting so a question
// that merely starts with a similar word is never truncated.
const TITLE_GREETING_PREFIX =
  /^\s*(გამარჯობათ|გამარჯობა|მოგესალმებით|მოგესალმები|სალამი|დილა მშვიდობისა|საღამო მშვიდობისა|hello|hi|hey|dear)(?:\s+[\p{L}.]+){0,2}\s*[,!.\-—]+\s*/iu;

function titleSnippetFrom(question: string): string {
  const stripped = question.replace(TITLE_GREETING_PREFIX, '').trim();
  const body = stripped.length > 0 ? stripped : question.trim();
  return body.length > ASK_TITLE_SNIPPET_CHARS
    ? `${body.slice(0, ASK_TITLE_SNIPPET_CHARS - 1)}…`
    : body;
}
// Anti-runaway ceiling, not a product limit (the product decision is "no
// limits, the user pays tokens") — one account still must not be able to
// blanket the network in a day. Env-adjustable.
const MAX_ASKS_PER_SENDER_PER_DAY = Number(process.env.MAX_ASKS_PER_SENDER_PER_DAY ?? 20);
// D134 (8 Sep): the brake is on the receiving side — new questions one person
// may receive from everyone in a day. The founder's number; env-adjustable.
const MAX_ASKS_RECEIVED_PER_PERSON_PER_DAY = Number(
  process.env.MAX_ASKS_RECEIVED_PER_PERSON_PER_DAY ?? 2,
);
const MAX_QUESTION_CHARS = 600;

export interface TaskAsk {
  id: number;
  task_id: number;
  to_user_id: number;
  to_name: string | null;
  status: string;
  question: string;
  answer: string | null;
  created_at: string;
  /** #1684: the stamps the ask's state is read from (askState.ts). */
  declined_at?: string | null;
  seen_at?: string | null;
  later_until?: string | null;
  expired_at?: string | null;
}

// Machine-readable refusal codes (ticket 6 close, answers 3/4): the assistant
// and the tester must be able to tell WHY a send was refused without parsing
// Georgian prose — invented causes ("test mode", "opted out") all traced back
// to paraphrased error strings.
export type AskRefusalReason =
  | 'empty_question'
  | 'task_not_open'
  | 'consent_pending'
  | 'recipient_not_member'
  | 'recipient_opted_out'
  | 'recipient_not_on_netai'
  | 'never_contact'
  | 'outside_plan'
  | 'self_send'
  | 'daily_cap_reached'
  /** #1685: the open wave already has its three (five); the next goes when it closes. */
  | 'wave_full'
  | 'recipient_daily_limit_reached'
  | 'conversation_ask_limit_reached'
  | 'monthly_ask_budget_reached'
  | 'ask_fatigue_budget_exhausted'
  | 'person_daily_relay_limit_reached'
  | 'duplicate_ask_in_flight'
  /**
   * #1915: the recipient's own boundary covers the subject. Named so that
   * neither the code nor the words give the asker's run a topic or a refusal
   * to retell — the tester's 42120: „they're not someone to ask on this
   * topic, I already tried and they passed", about a question she never saw.
   */
  | 'not_sent_this_time';

/** What the asker's run is told when a boundary stops a send: nothing it can retell as a reason. */
export function notSentThisTime(toName: string): string {
  return (
    `${toName}-სთვის ეს კითხვა ამჯერად არ გაიგზავნა. მფლობელს უთხარი მხოლოდ: „ამჯერად ვერ გავიდა". ` +
    `${toName}-ს ეს კითხვა არ უნახავს და არაფერი უპასუხია. ` +
    // The tester's 42175: „want me to try again?" loops — a retry cannot go through.
    `ხელახლა ცდას ნუ შესთავაზებ და ნურც დაჰპირდები — ${toName}-სთან ეს კითხვა ვერ გავა. ` +
    'შემდეგ სხვა ადამიანი შესთავაზე ან განაგრძე ძებნა.'
  );
}

export type CreateAskOutcome =
  /**
   * `answered_automatically`: the recipient's standing rule answered it (Task 22).
   * `note`: a relay that worked, on an ask whose own answer is still owed —
   * see createRelayAsk. Only that path sets it.
   */
  | { sent: true; ask_id: number; to_name: string; answered_automatically?: true; note?: string }
  | { sent: false; error: string; reason?: AskRefusalReason; reopens_at?: string };

/**
 * What the assistant is told when a budget refuses a send. One table, keyed by
 * the budget's own machine-readable reason, so a refusal can never be reported
 * as something it is not — every invented cause ("test mode", "they opted
 * out") began life as a paraphrased error string.
 */
/**
 * Ticket 20 row 127 — the two things every "we did not write to them" refusal
 * has to say, in one place so they cannot drift apart.
 *
 * Goal 3533, 16 September: the ask to Lika was refused by the receiving-side
 * brake at 10:48:19. The owner read „the daily limit ran out" while her own
 * header showed 1,433 credits, so it looked like HER quota — and the reply
 * closed with „Lika's answer will come tomorrow" when nothing had been sent to
 * Lika at all. Goal 3539: the same brake twice, and the goal simply stopped.
 *
 * Both are my texts. „ხვალ ისევ შესაძლებელი იქნება" is a true sentence about
 * the LIMIT that a model will read as a promise about an ANSWER, and inviting
 * that reading is the defect. A human assistant says whose limit it is in one
 * line and carries straight on with everyone else.
 */
/**
 * Row 208, second pass — and the seat corrected their own rule eighty minutes
 * after I shipped it on their advice, which is why this says „24 hours" and
 * not a date.
 *
 * Their test: they tried to trigger a fresh refusal and could not, because the
 * ask WENT THROUGH. So they counted the asks on the server instead of trusting
 * any wording:
 *
 *   17 Sep 14:23:29  ask 2049 to 13927
 *   17 Sep 14:23:50  ask 2052 to 13927
 *   18 Sep 14:15:15  REFUSED — „has already received two new questions TODAY"
 *   18 Sep 15:39:16  ask 2377 to 13927, SENT
 *
 * She had received NOTHING today. Both were twenty-four hours earlier. The
 * refusal said „today" about yesterday's messages — while correctly refusing.
 *
 * And the two times bracket the window to within eight minutes: 24 hours after
 * 2052 is 18 Sep 14:23:50; the refusal fired at 14:15 (inside, refused) and the
 * send succeeded at 15:39 (outside, allowed). EVERY ONE OF THESE CAPS IS A
 * ROLLING TWENTY-FOUR HOURS — the SQL says `NOW() - INTERVAL '24 hours'` in all
 * three — and never a calendar day.
 *
 * So „today" was not merely stale. It was false when written. A DATE would be
 * false too: „on 18 September" is simply untrue, and „on 17 September" is true
 * and useless. The only sentence that is both true when written and still true
 * an hour later is the one about the WINDOW.
 *
 * The rule survives its own instance: durable server text must contain nothing
 * that can go false. „Today" failed it twice — once by ageing, and once by
 * never having been true.
 */

/**
 * Row 208, first pass — the fault, and why anything relative is a bug here.
 *
 * A cap refusal said „X has ALREADY RECEIVED … today". True at 14:15:15. By
 * 14:46, in the same thread, the assistant narrated it back to the owner as
 * „…could not receive another question YESTERDAY", and built its next sentence
 * out of the contrast — a story about two days that all happened inside half
 * an hour.
 *
 * The model was not careless. The conversation it re-reads carries no times at
 * all, so „today" in an older message is a word with no anchor, and „yesterday"
 * is a reasonable reading of it.
 *
 * Their rule, which is better than the fix I proposed: THE SERVER MUST NEVER
 * WRITE A RELATIVE TIME WORD INTO TEXT THAT PERSISTS IN A THREAD. „Today" was
 * true when written and false an hour later, and nothing had to change for it
 * to become false except time passing. A DATE is true at any distance, forever.
 * No alignment, no tokens, no stamps in anybody's words.
 *
 * I had proposed timestamping the history to the minute. They pointed out that
 * the whole question the model got wrong was „today or not today" — a day
 * boundary — and that a positional list of times is a silent counting task
 * that, when it slips, produces a confidently wrong minute instead of a vague
 * wrong day. They were right and that proposal is withdrawn.
 *
 * What this does NOT cover, said by them before I could find it: the MODEL's
 * own relative words („I'll come back in six hours") persist the same way and
 * are out of reach here.
 */
const NOT_THE_OWNERS_LIMIT =
  ' ეს მფლობელის ლიმიტი არ არის და მის ბალანსს, კრედიტებს ან ტოკენებს არ უკავშირდება — ' +
  'არასოდეს თქვა „შენი დღიური ლიმიტი ამოიწურა".';

/**
 * Never promise an answer from somebody who was never written to. This is the
 * sentence the „tomorrow" phrasing kept producing, and it is worth its own
 * constant because it applies to every refusal, including the ones where the
 * goal genuinely has nowhere else to go.
 */
const PROMISE_NO_ANSWER =
  ' არასოდეს დაჰპირდე პასუხს იმ ადამიანისგან, ვისაც შეტყობინება არ გაგზავნია.';

/**
 * A blocked route is not a blocked goal (Lika's file on 3533 and 3539, where
 * it was). Continue in the same run and without asking — asking turns one
 * blocked person into a stopped goal, which is what happened twice.
 */
// D605 (the founder, 3 Oct): refusals are short and do not ask the model to
// retell them. „და ეს თქვი" was one of the lines replies recounted.
const CONTINUE_BY_OTHER_ROUTES =
  ' მიზანი არ ჩერდება: ამავე გაშვებაში გააგრძელე სხვა გზებით (ქსელის სხვა ადამიანები, ' +
  'მეორე წრე, ვები), ნებართვის გარეშე. ეს ცალკე არ მოუყვე მფლობელს.';

/** Whose the asks in a recipient's window were, said as the owner would read it. */
export function whoseAsksWereThey(
  rows: readonly { from_user_id: string | number }[],
  ownerId: string,
): string {
  const own = rows.filter((r) => String(r.from_user_id) === ownerId).length;
  // The tester's 1112 (34416, 34419): „the owner's own" was read out to the owner
  // in the third person. These words reach them as written, so they say „your".
  if (own === 0) return 'სხვა ადამიანებისგან';
  if (own === rows.length) return 'ყველა შენი საკუთარი კითხვა იყო';
  return `${own} შენი საკუთარი, დანარჩენი სხვებისგან`;
}

/** Enough rows to find the reopening; a person never holds many asks in a day. */
const RECEIVED_WINDOW_READ_LIMIT = 20;
const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Tester 929 — when a recipient's rolling 24-hour window has room again: the
 * moment enough of the oldest asks fall out of it to bring the count below the
 * cap. `received` is the window's asks, oldest first.
 */
export function recipientWindowReopensAt(received: readonly Date[]): Date {
  const mustFallOut = received.length - MAX_ASKS_RECEIVED_PER_PERSON_PER_DAY;
  const pivot = received[Math.max(0, mustFallOut)] ?? new Date();
  return new Date(pivot.getTime() + WINDOW_MS);
}

/** „Opens again at 06:39 Tbilisi, 2 Oct" — the exact time, so no reply says „as soon as it opens". */
function reopensLine(toName: string, at: Date): string {
  const when = new Intl.DateTimeFormat('ka-GE', {
    timeZone: 'Asia/Tbilisi',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
  return (
    ` ${toName}-სთვის ადგილი გაიხსნება ${when}-ზე (თბილისის დროით). მიზნის შემდეგი შემოწმება ` +
    'სერვერმა ზუსტად ამ დროზე დააყენა. თუ მფლობელს ეტყვი, როდის სცდი ხელახლა, ეს დრო დაასახელე — ' +
    '„როგორც კი გაიხსნება" დროის გარეშე არ დაწერო.'
  );
}

const RELAY_REFUSALS: Readonly<
  Record<GrowthAskRefusalReason, { reason: AskRefusalReason; error: (toName: string) => string }>
> = {
  conversation_limit_reached: {
    reason: 'conversation_ask_limit_reached',
    error: () =>
      'ამ საუბარში უკვე გაიგზავნა ერთი კითხვა სხვა ადამიანთან — ეს ლიმიტია ' +
      'თითო საუბარზე. მომხმარებელს უთხარი, რომ მეორე ადამიანთან მისაწერად ახალი ' +
      'საუბარი უნდა დაიწყოს.',
  },
  monthly_budget_reached: {
    reason: 'monthly_ask_budget_reached',
    error: () =>
      'ამ თვის კითხვების ლიმიტი ამოწურულია — მომდევნო თვეს განახლდება. ' +
      'მომხმარებელს მშვიდად უთხარი, ბოდიში ან „ტექნიკური შეცდომა" არ ახსენო.',
  },
  // A different thing entirely, and it used to wear the same name: the budget
  // is not spent, it has been narrowed by unanswered asks. Say that, because
  // "this month's limit is used up" to someone who has sent nothing this month
  // is simply false (ticket 9 task 17).
  fatigue_budget_exhausted: {
    reason: 'ask_fatigue_budget_exhausted',
    error: () =>
      'ამ ანგარიშის კითხვების ბიუჯეტი შემცირებულია, რადგან ბოლო პერიოდში გაგზავნილ ' +
      'რამდენიმე კითხვას პასუხი არ მოჰყოლია — და ამჟამად ამოწურულია. ეს დროებითია: ძველი ' +
      'უპასუხო კითხვები ფანჯრიდან გამოდის, ან ერთ-ერთს პასუხი მოჰყვება, და ბიუჯეტი ბრუნდება. ' +
      'მომხმარებელს ეს პირდაპირ უთხარი — არც ბოდიში, არც „ტექნიკური შეცდომა".',
  },
  // Not a fault and not a technical problem: the conversation is alive, this
  // person has simply had their day's worth of it. Say when it reopens.
  person_daily_relay_limit_reached: {
    reason: 'person_daily_relay_limit_reached',
    error: (toName: string) =>
      `${toName}-სთან ამ მიზანზე ბოლო 24 საათში უკვე ${RELAY_MESSAGES_PER_PERSON_PER_DAY} ` +
      'შეტყობინება გაიგზავნა — ეს ზღვარი ერთ ადამიანზე მოძრავ 24 საათზეა, არა კალენდარულ ' +
      'დღეზე. ასევე დაწერე: „ბოლო 24 საათში". „დღეს" არ დაწერო — არც მაშინ იქნება ' +
      'სიმართლე, როცა წერ, არც მოგვიანებით. ' +
      'მომხმარებელს ეს პირდაპირ უთხარი — არც ბოდიში, არც „ტექნიკური შეფერხება", და არ ' +
      'თქვა, თითქოს ამ ადამიანმა რამე უარყო.' +
      NOT_THE_OWNERS_LIMIT +
      PROMISE_NO_ANSWER,
  },
};

/**
 * The recipient's thread for a NEW conversation: born a task-shaped item
 * awaiting their reply, announced to their devices. A follow-up never comes
 * here — it writes into the thread this one opened.
 */
async function openAskThread(
  toUserId: number,
  senderName: string,
  safeQuestion: string,
  // The RECIPIENT's language: the caption above this thread is the first thing
  // they see of it, and it was Georgian on every account in every country.
  language: RunLanguage,
): Promise<number> {
  const thread = await createThread(
    String(toUserId),
    'incoming_ask',
    `${senderName}: ${titleSnippetFrom(safeQuestion)}`,
    undefined,
    {
      isTask: true,
      status: 'needs_you',
      // The product's standard line for this status, rather than a second
      // Georgian wording of it — „პასუხს ელოდება" and „შენი პასუხი სჭირდება"
      // were two phrasings of one state, and only one of them had translations.
      statusLine: RUN_STRINGS[language].statusLines.needs_you,
    },
  );
  emitThreadCreated(String(toUserId), {
    id: thread.id,
    type: thread.type,
    title: thread.title,
    is_task: thread.is_task,
    status: thread.status,
    status_line: thread.status_line,
  });
  return thread.id;
}

/**
 * Send a question to ANOTHER member on the task's behalf: creates the ask row,
 * a thread on the recipient's side (type incoming_ask) with the question as
 * the opening assistant message, and a push. The recipient answers with plain
 * text; their assistant relays the approved wording back through
 * sendApprovedAskAnswer, which wakes this task.
 *
 * A goal may write to the same person more than once (ticket 9 task 12): the
 * second and later messages continue the same recipient thread, count against
 * a per-person daily budget instead of the monthly growth one, and each still
 * requires its sender's explicit approval of the exact text.
 */
/**
 * Has this account actually used Netai? The same three signals membership.ts
 * reads (Rule 13): a thread, a search, or a live subscription. A row in the
 * shared user table alone is an old-Ally account — a target, not a recipient.
 */
/**
 * Ticket 13 Task 42 (7): a goal that already asked somebody and now asks a
 * different person has been REROUTED — an outcome row for the ladder.
 */
async function recordReroutedIfSecondRoute(
  fromUserId: string,
  taskId: number,
  toUserId: number,
): Promise<void> {
  try {
    const earlier = await query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM task_asks
       WHERE task_id = $1 AND to_user_id <> $2 AND is_follow_up = FALSE`,
      [taskId, toUserId],
      ASK_QUERY_TIMEOUT_MS,
    );
    if (Number(earlier.rows[0]?.n ?? 0) === 0) return;
    const { recordTaskOutcome } = await import('./partH.service');
    await recordTaskOutcome(fromUserId, taskId, 'rerouted');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[task-asks] rerouted outcome for task ${taskId} failed:`,
      (err as Error).message,
    );
  }
}

async function isNetaiUser(userId: number, subscriptionStatus: string | null): Promise<boolean> {
  if (subscriptionStatus !== null && NETAI_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
    return true;
  }
  const result = await query<{ opened: boolean }>(
    `SELECT (EXISTS (SELECT 1 FROM threads t WHERE t.user_id = $1)
             OR EXISTS (SELECT 1 FROM search_activity sa WHERE sa.user_id = $1::text)) AS opened`,
    [userId],
    ASK_QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.opened === true;
}

/**
 * Ticket 20 row 146 — CAN this person be asked, answered BEFORE the plan is
 * approved rather than a minute after.
 *
 * Tornike's own goal 3763, 16 September. The plan named three people; he
 * approved it at 15:50:28; at 15:51:15 all three ask_contact calls were
 * refused, every one of them „has an account but has not opened Netai". He was
 * never told, before he said yes, that not one of the three could be reached.
 *
 * The same two gates createAsk applies at send time, asked early: is this
 * phone a member at all, and has that member ever opened the product. The
 * opt-out list is deliberately NOT consulted here — a plan is shown to its
 * owner, and „this person has asked not to be contacted" is a third party's
 * private decision that must not be surfaced to somebody else (12 Aug). It
 * still refuses at send time, where it belongs.
 */
export type AskReach = 'ok' | 'not_member' | 'never_opened';

export async function canBeAsked(contactPhone: string): Promise<AskReach> {
  const member = await query<{ userId: number; subscriptionStatus: string | null }>(
    `SELECT up."userId", u.subscription_status AS "subscriptionStatus"
     FROM "UserPhone" up JOIN "User" u ON u.id = up."userId"
     WHERE regexp_replace(up.phone, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')
       AND u."deletedAt" IS NULL
     LIMIT 1`,
    [contactPhone],
    ASK_QUERY_TIMEOUT_MS,
  );
  const row = member.rows[0];
  if (!row) return 'not_member';
  return (await isNetaiUser(row.userId, row.subscriptionStatus)) ? 'ok' : 'never_opened';
}

/** The task's plan columns, read at send time — a plan may have been approved a second ago. */
async function planRowFor(
  taskId: number,
): Promise<{ plan: TaskPlan | null; plan_version: number; plan_approved_at: string | null }> {
  const result = await query<{
    plan: TaskPlan | null;
    plan_version: number;
    plan_approved_at: string | null;
  }>(
    `SELECT plan, plan_version, plan_approved_at FROM tasks WHERE id = $1 LIMIT 1`,
    [taskId],
    ASK_QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? { plan: null, plan_version: 0, plan_approved_at: null };
}

/** Statuses that on their own prove the account has used Netai. */
const NETAI_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set([
  'active',
  'trialing',
  'past_due',
]);

/** The bridge picker, or the ordinary buttons when it cannot be built. */
async function pickerFor(
  readerUserId: string,
  bridgeNeed: BridgeNeed,
  language: RunLanguage,
): Promise<BridgePicker | null> {
  try {
    return await bridgePicker(readerUserId, bridgeNeed, language);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[bridge-picker] sent without the picker:', (err as Error).message);
    return null;
  }
}

/** Who an owner's typed instruction is about — see the row 251 note in createAsk. */
interface NamedPerson {
  readonly threadId: number | undefined;
  readonly taskId: number;
  readonly taskCreatedAt: string;
  readonly fromUserId: string;
  readonly contactPhone: string;
}

/**
 * Did the owner's own latest typed line instruct writing to exactly this
 * person (D316)? Used by the permission wall and, since board #661's night
 * (tester 1075, conversation 31787), by the plan wall too: „ask Maka" is the
 * owner's consent to write to Maka whether or not the approved plan lists her.
 * Before, the plan wall refused her and sent the model to propose a plan, the
 * plan tool refused that and sent it back, and the owner was told a question
 * was going out that never left.
 */
async function ownerJustNamedPerson(person: NamedPerson): Promise<boolean> {
  if (person.threadId === undefined) return false;
  try {
    // The tester's 1131 (V1, 36317): the owner pressed the offered button
    // „კი, ვანოს ჰკითხე" — the person and the action, chosen by the owner — and
    // the tap was skipped as „not a typed line", so both walls refused Vano. A
    // tapped button that itself names exactly this person is the owner's word
    // for this one ask; a tap that names nobody („დიახ, გაუგზავნე") still falls
    // back to the typed line, as 279 run 2 needs.
    const tapped = await latestOwnerLine(person);
    if (tapped !== null && (await lineNamesThisPerson(tapped, person))) return true;
    const said = await query<{ content: string }>(
      `SELECT c.content FROM conversations c
          WHERE c.thread_id = $1 AND c.role = 'user'
            AND COALESCE(c.kind, '') <> 'event' AND c.content <> ''
            AND c.created_at >= $2::timestamptz - ($3 || ' minutes')::interval
            AND NOT EXISTS (
              SELECT 1 FROM conversations a
               WHERE a.thread_id = c.thread_id AND a.role = 'assistant'
                 AND a.created_at < c.created_at
                 AND a.created_at >= $2::timestamptz - ($3 || ' minutes')::interval
                 AND jsonb_typeof(a.choices) = 'array' AND a.choices ? c.content)
          ORDER BY c.created_at DESC LIMIT 1`,
      [person.threadId, person.taskCreatedAt, TYPED_LINE_GRACE_MINUTES],
      ASK_QUERY_TIMEOUT_MS,
    );
    return await lineNamesThisPerson(said.rows[0]?.content ?? '', person);
  } catch (error) {
    // Fails towards refusing, which is the direction this gate exists for.
    // eslint-disable-next-line no-console
    console.error(`[ask] task ${person.taskId}: could not read who the owner named:`, error);
    return false;
  }
}

/** The owner's newest line on this goal, a tapped button included. */
async function latestOwnerLine(person: NamedPerson): Promise<string | null> {
  const result = await query<{ content: string }>(
    `SELECT c.content FROM conversations c
        WHERE c.thread_id = $1 AND c.role = 'user'
          AND COALESCE(c.kind, '') <> 'event' AND c.content <> ''
          AND c.created_at >= $2::timestamptz - ($3 || ' minutes')::interval
        ORDER BY c.created_at DESC LIMIT 1`,
    [person.threadId, person.taskCreatedAt, TYPED_LINE_GRACE_MINUTES],
    ASK_QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.content ?? null;
}

/** Is this line an instruction that names exactly this person, by the owner's own label? */
async function lineNamesThisPerson(line: string, person: NamedPerson): Promise<boolean> {
  if (!looksLikeContactInstruction(line)) return false;

  // The owner's own phonebook decides which person that sentence names,
  // and only an unambiguous answer counts.
  // Candidates by plain containment of the label or, for a label ending in
  // „-ი", of its stem; namedLabel decides which of them the sentence names.
  const candidates = await query<{ phone: string; alias: string }>(
    `SELECT ua.phone, ua.alias
         FROM "UserAlias" ua
        WHERE ua."contactId" = $1::int
          AND LENGTH(TRIM(ua.alias)) >= $3
          AND (POSITION(LOWER(TRIM(ua.alias)) IN LOWER($2)) > 0
               OR (TRIM(ua.alias) LIKE '%ი'
                   AND POSITION(LOWER(LEFT(TRIM(ua.alias), -1)) IN LOWER($2)) > 0))
        ORDER BY LENGTH(TRIM(ua.alias)) DESC
        LIMIT $4`,
    [person.fromUserId, line, MIN_NAMED_LABEL_CHARS, MAX_NAMED_LABEL_CANDIDATES],
    ASK_QUERY_TIMEOUT_MS,
  );
  const labels = candidates.rows.filter((row) => labelNamedIn(line, row.alias));
  const best = labels[0];
  if (best === undefined) return false;
  const runnerUp = labels[1];
  // Two labels of the same length both inside the sentence name nobody.
  if (runnerUp !== undefined && runnerUp.alias.trim().length === best.alias.trim().length) {
    return false;
  }
  return phoneDigits(best.phone) === phoneDigits(person.contactPhone);
}

/** The plan wall's D316 exception: the owner's own instruction names this person. */
async function ownerNamedThemOutsidePlan(
  threadId: number | undefined,
  taskId: number,
  fromUserId: string,
  contactPhone: string,
): Promise<boolean> {
  const task = await getTaskById(taskId);
  if (task === null) return false;
  const named = await ownerJustNamedPerson({
    threadId,
    taskId,
    taskCreatedAt: task.created_at,
    fromUserId,
    contactPhone,
  });
  if (named) {
    // eslint-disable-next-line no-console
    console.log(`[ask] task ${taskId}: outside the plan, but the owner named this person (D316)`);
  }
  return named;
}

export async function createAsk(
  fromUserId: string,
  taskId: number,
  contactPhone: string,
  question: string,
  parentAskId?: number,
  threadId?: number,
  bridgeNeed?: BridgeNeed,
): Promise<CreateAskOutcome> {
  const trimmed = question.trim().slice(0, MAX_QUESTION_CHARS);
  if (!trimmed)
    return { sent: false, reason: 'empty_question', error: 'Pass a non-empty question.' };

  // #1685 (A2): the wave this ask goes in; null when the waves do not count it.
  let waveNo: number | null = null;

  // SERVER-SIDE permission gate (ticket-2 P0, thread 7723): a message that
  // reaches a real person's phone must never depend on prompt text alone —
  // the rule lived only in the task_step block, and every mode carries every
  // tool, so a quick_answer run created task_331 and fired an ask in one
  // move, permission_granted = false. The gate lives HERE, at the single
  // choke point every surface (in-app dispatch, connector, future callers)
  // must pass through. Relays are exempt by design: a relay is the RECIPIENT
  // forwarding the already-permitted parent ask with their own consent.
  if (parentAskId === undefined) {
    const task = await getTaskById(taskId);
    if (!task || String(task.user_id) !== fromUserId || task.status !== 'open') {
      return { sent: false, reason: 'task_not_open', error: 'Task not found or not open.' };
    }
    /**
     * ROW 251, FOURTH GATE — AND IT IS THE FIRST ONE, WHICH IS WHY IT WAS MISSED.
     *
     * 23 September let an accepted introduction past the PLAN gate (below).
     * The tester passed that twice and it broke again today, 25 September,
     * thread 24397: Test 16 said yes at 10:32:57, the owner typed „write to
     * Test 17 and ask when we could talk this week", and `ask_contact` was
     * refused twice — not by the plan gate, by the PERMISSION gate above it,
     * which the bypass never reached.
     *
     * The shape is new and D316 made it: a goal born from a first-message
     * introduction goes out in the same turn with NO PLAN. Task 10168 was
     * created at 10:30:27, `request_introduction` succeeded at 10:32:04, and
     * nothing on that path ever records permission — so the goal that exists
     * ONLY to reach one person cannot write to the one person who agreed.
     *
     * THE ARGUMENT IS THE ONE ALREADY MADE AND ALREADY REVIEWED, one gate
     * down: the owner asked for this introduction, and the target THEMSELVES
     * said yes, relayed by somebody who knows them both. Both parties have
     * agreed about that one person — which is more than a permission flag
     * carries, not less.
     *
     * NARROW IN EXACTLY THE SAME WAY: this task, this asker, and only the
     * phones on an accepted, direct introduction. Everybody else still meets
     * the wall, and the wall is unchanged for them.
     *
     * LAZY ON PURPOSE. This is the hot path of every ask, and the lookup runs
     * only when a gate is about to refuse — never on a send that was going
     * through anyway.
     */
    let acceptedPhones: string[] | null = null;
    const acceptedIntroductionToThisPerson = async (): Promise<boolean> => {
      acceptedPhones ??= await acceptedIntroductionPhones(taskId, fromUserId);
      return acceptedPhones.some((p) => phoneDigits(p) === phoneDigits(contactPhone));
    };

    /**
     * ⚠️ ROW 251, THE LAST PIECE — THE OWNER NAMED SOMEBODY AND WAS ASKED TO
     * APPROVE A PLAN TO DO IT.
     *
     * Thread 24534. Plan v1 said „Who I will ask: nobody". The owner typed
     * „Ask Netai Test 14 if they know a good accountant." The refusal above
     * now sends the model to `grant_task_permission`, which is the right door
     * and grants the permission — AND THE ASK STILL DIES HERE, because a plan
     * is proposed and unapproved and `grantTaskPermission` does not clear it.
     *
     * Misho, asked in plain words on 25 September: „ask X about Y" IS consent
     * to write to X. So the draft does not get to outrank the owner's own
     * sentence for the one person that sentence names. Everybody else in the
     * draft still waits for the yes.
     *
     * ════════ WHY IT MATCHES THE WAY IT DOES ════════
     *
     * This decides who receives a message, so a wrong match is a message to
     * the wrong person — the one failure this whole file is shaped around.
     *
     *   * WHOLE-LABEL CONTAINMENT, not word stems. „Netai Test 14" and „Netai
     *     Test 15" share every word once „14" and „15" are dropped as too
     *     short, which is exactly how a stem matcher would send the founder's
     *     question to the wrong seat. A missed match is safe — the ask is
     *     refused, as it is today — so the strict test is the right one and
     *     under-matching an inflected Georgian name is a cost worth paying.
     *
     *   * THE LONGEST LABEL WINS, AND A TIE REFUSES. „Nino" is contained in
     *     „ask Nino Beridze", so without this a message about Nino Beridze
     *     would open the gate for a different Nino. The query asks the
     *     owner's own phonebook which label is the longest one inside the
     *     sentence, and that label has to be this person's.
     *
     *   * THE OWNER'S LATEST TYPED MESSAGE ONLY. Not the model's text, not an
     *     engine event, and not a line from before this goal. A tap on a
     *     button the model offered is not a typed message (279 run 2: „ჰკითხე
     *     Netai Test 103-ს…", then a tap on the model's „დიახ, გაუგზავნე" hid
     *     the sentence and the ask waited for a second yes).
     *
     *   * AND IT IS AN INSTRUCTION, by the same predicate D316 already uses.
     *     „Nino already knows about this" names Nino and instructs nothing.
     *
     * Lazy, like the one above: it runs only when a gate is about to refuse.
     */
    const ownerJustNamedThisPerson = (): Promise<boolean> =>
      ownerJustNamedPerson({
        threadId,
        taskId,
        taskCreatedAt: task.created_at,
        fromUserId,
        contactPhone,
      });

    if (!task.permission_granted && (await acceptedIntroductionToThisPerson())) {
      // eslint-disable-next-line no-console
      console.log(
        `[ask] task ${taskId}: permission wall bypassed for an accepted introduction (row 251)`,
      );
    } else if (!task.permission_granted && (await ownerJustNamedThisPerson())) {
      /**
       * Misho, 3 October, on the night list's question: „ask X" does not get
       * asked a second time. The owner's own latest typed line naming exactly
       * this person, by their own phonebook label with no tie, IS the
       * permission for this one ask (D316). It used to refuse and send the
       * model to grant_task_permission and retry, which cost a refused call in
       * the owner's turn and was impossible in a turn the server started
       * (conversation 31788: the owner was asked „shall I send it?" again).
       * No goal-wide permission is written: every other person still needs
       * the yes.
       */
      // eslint-disable-next-line no-console
      console.log(
        `[ask] task ${taskId}: permission wall passed for the one person the owner's typed line names (D316)`,
      );
    } else if (!task.permission_granted) {
      /**
       * The wording matters (ticket 3 §6.8): the old text sent the model back
       * to the user even when consent had JUST been voiced, producing three
       * permission prompts for one send (thread 8152).
       *
       * ROW 249, 22 September, AND THE CASE THE WORDING STILL DID NOT COVER:
       * the refusal is correct and the state is a third of a second stale.
       * Run d8d74e6d, goal 8402, one single turn:
       *
       *   19:15:24.792  ask_contact            refused — permission is false
       *   19:15:25.092  approve_task_plan      the approval lands, 300ms later
       *   19:15:28.382  ask_contact            the retry
       *   19:15:28.384  grant_task_permission  2ms after its own retry
       *
       * `processToolBlocks` runs one turn's tools CONCURRENTLY, on the stated
       * ground that „a single turn's tool_use blocks are independent by
       * construction". This pair is the counterexample: one grants the
       * permission the other needs, and the model emitted them together
       * meaning an order the server does not keep. Two of ten approvals
       * tonight went this way.
       *
       * The model then obeyed the last sentence of this text and went back to
       * the owner with a fresh draft card — „since this task is set to ask
       * before anything goes out" — for a plan the owner had ALREADY approved,
       * and day one sent it while that card was still on the screen. So the
       * first thing this text now says is the thing that was true: your own
       * consent call may simply not have landed yet.
       *
       * THE ORDERING ITSELF IS THE REAL FIX and it is not made here. It is a
       * change to the hot path of every run, next to the consent wall, and it
       * is written up rather than done in the dark.
       *
       * ⚠️ 25 SEPTEMBER — AND THE ADVICE ABOVE SENT THE MODEL INTO A SECOND
       * REFUSAL THAT FORBIDS EXACTLY WHAT THIS ONE ASKS FOR.
       *
       * Found by `why.sh`, which prints what a run did after each no. Of the
       * 27 runs refused here in a week, 19 went and called the consent tool
       * and it worked in all 19 — and only 5 ever sent anything. THIRTEEN were
       * refused again on the retry, and eleven of those thirteen hit
       * `runApprovedAPlan` in chat.service.ts:
       *
       *   „Nothing sent, and nothing is needed from you: you approved the plan
       *    in this same turn, and day one is already starting behind your
       *    reply … Calling this here sends each of them the same question
       *    twice."
       *
       * Both guards are right. The instruction joining them was not: „call
       * approve_task_plan and repeat ask_contact" is correct for a GRANT and
       * wrong for an APPROVAL, because an approval starts day one by itself
       * and the repeat is the double-send. So the two are no longer told to do
       * the same thing.
       *
       * Nobody lost a message — day one wrote to them. What it cost was a
       * wasted turn per run and a model that had just been told to say nothing
       * had been sent, one sentence after being told to send it.
       */
      return {
        sent: false,
        reason: 'consent_pending',
        error:
          'ნებართვა არ არის: ამ დავალებაზე ნებართვა ჯერ ჩაწერილი არ არის. (1) თუ ამავე ' +
          'სვლაში უკვე გამოიძახე grant_task_permission — ეს უარი მას გაუსწრო და არაფერი ' +
          'გიშლის ხელს: გამოიძახე ის ცალკე და გაიმეორე ask_contact. (2) თუ ამავე სვლაში ' +
          // NOT „პირველ დღეს". That is the product's name for the plan's first
          // round and it is also the Georgian for „today" — and this text is
          // re-read hours later by a run with no clock. See
          // relativeWordsInServerText.test.ts, whose grep caught it here.
          'გამოიძახე approve_task_plan — ask_contact აღარ გაიმეორო: დამტკიცება თვითონ ' +
          'უშვებს გეგმის პირველ რაუნდს და ის თვითონ მისწერს გეგმაში დასახელებულ ' +
          'ადამიანებს, შენი გამეორება კი იმავე კითხვას ორჯერ გააგზავნიდა. ერთი-ორი ' +
          'წინადადებით უთხარი მფლობელს, რომ იწყებ და როდის დაუბრუნდები — და არ თქვა, ' +
          'რომ უკვე გააგზავნე. (3) თუ მომხმარებელს ამ საუბარში თანხმობა უკვე ნათქვამი ' +
          'აქვს („კი, გაუგზავნე", „დამტკიცებულია") — ხელახლა ნუ ჰკითხავ და ახალ ტექსტს ' +
          'ნუ აჩვენებ: გეგმაზე გამოიძახე approve_task_plan და გაჩერდი (2), გეგმის ' +
          'გარეშე grant_task_permission და გაიმეორე ask_contact. (4) მხოლოდ მაშინ, თუ ' +
          'თანხმობა ჯერ არ გითხოვია, ჰკითხე ერთხელ და აჩვენე ვის მისწერ და ზუსტად რა ' +
          'ტექსტს. უნებართვოდ გაგზავნა შეუძლებელია — ეს სერვერის წესია.',
      };
    }
    /**
     * Ticket 16 Task 99 (D119): a plan proposed and not yet approved is the
     * wall too — goal 1619 carried a legacy grant from August, a proposed plan
     * v1 and no approval, and an ask still went out. Until the yes, nothing new.
     *
     * ROW 251 — AND AN ACCEPTED INTRODUCTION REACHES PAST IT, FOR THE ONE
     * PERSON IT NAMES.
     *
     * This is the THIRD gate the row had to cross, and the tester found it by
     * getting through the other two: on goal 7163 the ask reached the right
     * person with the right number and was refused here, because that goal has
     * carried a proposed plan nobody approved since 21 September. The channel
     * worked; a two-day-old unapproved draft stopped it.
     *
     * The draft is about who the OWNER will write to for this goal, and it is
     * right that it waits for them. An accepted introduction is a different
     * fact about a different person: the owner ASKED for it, and the target
     * THEMSELVES said yes, relayed by somebody who knows them both. Both
     * parties have agreed about that one person, which is more than the plan
     * would have carried.
     *
     * NARROW IN THE SAME WAY AS THE PLAN GATE BELOW: this task only, this
     * asker only, and only the phones on an accepted, direct introduction.
     * Everyone else still waits for the plan.
     */
    const draftIsWaiting = (task.plan_proposed ?? null) !== null && planInForce(task) === null;
    const introAccepted = draftIsWaiting && (await acceptedIntroductionToThisPerson());
    if (introAccepted) {
      // eslint-disable-next-line no-console
      console.log(
        `[ask] task ${taskId}: unapproved plan bypassed for an accepted introduction (row 251)`,
      );
    }
    // The owner's own sentence, for the one person it names. See
    // `ownerJustNamedThisPerson` above for why the matching is this strict.
    const ownerNamedThem = !introAccepted && draftIsWaiting && (await ownerJustNamedThisPerson());
    if (ownerNamedThem) {
      // eslint-disable-next-line no-console
      console.log(
        `[ask] task ${taskId}: unapproved plan bypassed — the owner named this person (row 251)`,
      );
    }
    if (!introAccepted && !ownerNamedThem && draftIsWaiting) {
      return {
        sent: false,
        reason: 'consent_pending',
        error:
          'გეგმა შეთავაზებულია და მფლობელის „კი" ჯერ არ არის (approve_task_plan). სანამ ' +
          'გეგმა არ დამტკიცდება, ახალი კითხვა არავის არ მიდის — აჩვენე გეგმა და სთხოვე დასტური.',
      };
    }

    /**
     * #1685 (A2): an approved plan asks its people in waves — three at once,
     * five for real work. A plan candidate beyond the open wave waits for it to
     * close or for the silent-day wake; the person the owner named himself
     * never waits (D625).
     */
    const room = await waveRoomFor(
      task,
      contactPhone,
      async () => introAccepted || (await ownerJustNamedThisPerson()),
    );
    if (!room.allowed) {
      // eslint-disable-next-line no-console
      console.log(`[ask] task ${taskId}: refused — the open wave is full (#1685)`);
      return { sent: false, reason: 'wave_full', error: room.error };
    }
    waveNo = room.wave;
  }

  // The recipient must be a registered member (format-independent lookup).
  const member = await query<{
    userId: number;
    name: string | null;
    subscriptionStatus: string | null;
  }>(
    `SELECT up."userId", ${nameAsSavedBySql('$2::int', 'up."userId"')} AS name,
            u.subscription_status AS "subscriptionStatus"
     FROM "UserPhone" up JOIN "User" u ON u.id = up."userId"
     WHERE regexp_replace(up.phone, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')
       AND u."deletedAt" IS NULL
     LIMIT 1`,
    [contactPhone, fromUserId],
    ASK_QUERY_TIMEOUT_MS,
  );
  if (member.rows.length === 0) {
    return {
      sent: false,
      reason: 'recipient_not_member',
      error:
        'ეს კონტაქტი Netai-ს წევრი არ არის, მისწერა ვერ ხერხდება. მეორე წრის ადამიანზე ' +
        'მისწერე გამტარს (via_contacts-ის ნომერზე). არასოდეს თქვა „არავინ არ არის".',
    };
  }
  const toUserId = member.rows[0].userId;
  const toName = member.rows[0].name ?? 'კონტაქტი';

  // Person-level opt-out (ticket 4, item 00) — checked HERE, at send time, and
  // ahead of every other rule: a refusal to be contacted is about the person,
  // not the task, and it must not depend on the assistant's wording. Relays are
  // NOT exempt: a relay is still a message arriving on that person's phone.
  // Two lists, one rule: the account-level opt-out, and the phone-level one
  // that outlives a deleted account (migration 056) — an erased number must
  // not be reachable again just because someone still has it in a contact list.
  if ((await isOptedOutFromAsks(toUserId)) || (await isPhoneOptedOut(contactPhone))) {
    return {
      sent: false,
      reason: 'recipient_opted_out',
      error:
        `${toName}-მ მოითხოვა, რომ Netai-დან შეტყობინებები აღარ მიეღო — ამიტომ მას ვერაფერს ვწერთ, ` +
        'ვერც ამ და ვერც სხვა დავალებაზე. ეს მისი გადაწყვეტილებაა და პატივს ვცემთ. მფლობელს ' +
        'პირდაპირ და მშვიდად უთხარი ეს (არა „ტექნიკური შეფერხება") და შესთავაზე სხვა ადამიანი.',
    };
  }

  /**
   * ROW 247 — THE LAST NET, AND IT IS DELIBERATELY NOT WHERE THE RULE LIVES.
   *
   * „Never named and marked, never refused at send" is the shape the founder
   * REJECTED, which is why the search and the plan act first and this person is
   * normally absent long before anything reaches here. This line exists so that
   * „no question about that subject will reach them" is true whatever else went
   * wrong — and the seat's run of 12:20 is why it is not theoretical: every
   * subject search came back empty and the model named her anyway, off
   * `get_top_connectors`.
   *
   * THE REFUSAL SAYS NOTHING ABOUT A BOUNDARY, and that is the whole point. The
   * asker must never learn that one exists; the message above it, for a person
   * who has stopped everything, is a decision that person chose to make public
   * by making it absolute. This one is a subject they did not want to discuss,
   * and the model is told to move on rather than to explain.
   *
   * THE SUBJECT HERE IS THE QUESTION ITSELF, not the goal, and that is the
   * more precise thing to compare at this point: the question is what would
   * actually arrive on their phone. The plan gate one layer up uses the goal,
   * because there the person is being chosen for a goal and no question exists
   * yet.
   */
  if (await askBoundaryBlocks(contactPhone, question)) {
    // eslint-disable-next-line no-console
    console.log(
      `[ask-boundary] task ${taskId}: send refused — the recipient's own boundary covers this subject`,
    );
    return { sent: false, reason: 'not_sent_this_time', error: notSentThisTime(toName) };
  }

  // The recipient must be a NETAI USER — somebody who has actually opened the
  // product — not merely a row in the shared user table (D103, D121: "members
  // must be Netai users; an old-Ally account alone is not enough"). An ask to
  // an old-Ally account lands in an inbox nobody has ever opened.
  //
  // Paying is NOT required (Ticket 10 Task 25 (b), D123: a non-paying member
  // can answer and help on a paying member's task). Until 7 Sep this gate
  // demanded an active subscription, so a lapsed friend could not even be
  // asked. The rule before it (a hand-picked allowlist) was retired on 24 Aug.
  //
  // Both refusals are worded so they CANNOT be read as the recipient's own
  // choice (12 Aug: the model once translated a refusal into "this person
  // switched Netai messages off", a false statement about a third party).
  if (!(await isNetaiUser(toUserId, member.rows[0].subscriptionStatus))) {
    return {
      sent: false,
      reason: 'recipient_not_on_netai',
      error:
        'ვერ გაიგზავნა: ამ ადამიანს ანგარიში აქვს, მაგრამ Netai ჯერ არ გახსნია — კითხვა ' +
        'უპასუხოდ დარჩებოდა. მისი ანგარიშის შესახებ არაფერი თქვა. სწორი გზა მოწვევაა: ' +
        'invite_contact-ით შესთავაზე მფლობელს მოსაწვევი ტექსტი, ან თავად მისწეროს.',
    };
  }

  if (String(toUserId) === fromUserId) {
    return { sent: false, reason: 'self_send', error: 'საკუთარ თავს ვერ მისწერ.' };
  }

  // The brake on the RECEIVING side (D134, 8 Sep): however many people want
  // to ask, one person's phone takes at most this many NEW questions a day
  // from everyone together — the founder's „two messages to the same person".
  // A follow-up inside a live conversation is not a new question and is
  // capped separately (RELAY_MESSAGES_PER_PERSON_PER_DAY).
  const receivedToday = await query<{ created_at: string | Date; from_user_id: string | number }>(
    `SELECT created_at, from_user_id FROM task_asks
     WHERE to_user_id = $1 AND is_follow_up = FALSE
       AND created_at > NOW() - INTERVAL '24 hours'
     ORDER BY created_at ASC
     LIMIT ${RECEIVED_WINDOW_READ_LIMIT}`,
    [toUserId],
    ASK_QUERY_TIMEOUT_MS,
  );
  const liveWithThisPerson = await query<{ ask_thread_id: number | null }>(
    `SELECT ask_thread_id FROM task_asks
     WHERE task_id = $1 AND to_user_id = $2 AND status IN ('sent', 'answered')
     ORDER BY id DESC LIMIT 1`,
    [taskId, toUserId],
    ASK_QUERY_TIMEOUT_MS,
  );
  if (
    liveWithThisPerson.rows.length === 0 &&
    // The seat's 336: named test accounts only, empty in production. See
    // askCapExemptions — the cap protects the RECEIVER, so the exemption is
    // keyed on them, and a test account asking a real person is capped as ever.
    !receivingCapsAreOff(toUserId) &&
    receivedToday.rows.length >= MAX_ASKS_RECEIVED_PER_PERSON_PER_DAY
  ) {
    const reopensAt = recipientWindowReopensAt(
      receivedToday.rows.map((r) => new Date(r.created_at)),
    );
    // The tester's 983 and board #391: the question itself is kept, and the
    // server sends it at the reopening — it has passed every consent gate
    // above, so it needs no second yes.
    try {
      await holdAsk({
        taskId,
        toUserId,
        contactName: toName,
        contactPhone,
        question: trimmed,
        reopensAt,
        waveNo,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[ask] task ${taskId}: could not hold the question:`, (err as Error).message);
    }
    // Tester 929: the goal tries again at that minute, not a day later.
    try {
      await wakeTaskNoLaterThan(taskId, reopensAt);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[ask] task ${taskId}: could not move its wake to the reopening:`,
        (err as Error).message,
      );
    }
    return {
      sent: false,
      reason: 'recipient_daily_limit_reached',
      // Tester 941: the run's own set_task_wake must not push the wake past this.
      reopens_at: reopensAt.toISOString(),
      error:
        // The tester's 1102 (A13, 33013): „two new questions from other people" —
        // they were this owner's own two. Whose they were is now counted, not assumed.
        `${toName}-ს ბოლო 24 საათში უკვე ${MAX_ASKS_RECEIVED_PER_PERSON_PER_DAY} ახალი კითხვა ` +
        `მიუვიდა — ${whoseAsksWereThey(receivedToday.rows, fromUserId)}. ` +
        'ეს ზღვარი მოძრავ 24 საათზეა, არა კალენდარულ დღეზე. ასევე ' +
        'დაწერე: „ბოლო 24 საათში". „დღეს" არ დაწერო — არც მაშინ იქნება სიმართლე, როცა ' +
        'წერ, არც მოგვიანებით. ' +
        /*
         * Row 208, the seat's 319 — the same message described this limit two
         * ways, four hundred characters apart: „in the last 24 hours" and then
         * „once their daily limit resets".
         *
         * The model was not inventing the second one. THIS INSTRUCTION SAID
         * BOTH. Two sentences after forbidding the word „today" it called the
         * thing a DAILY limit, which is what „resets" comes from — a daily
         * limit has a moment it resets at and a rolling window does not. So
         * the run wrote one of each and both were quoted back at it.
         *
         * A rolling window is the harder of the two to describe and the only
         * true one: it clears gradually, question by question, as each falls
         * out of the far end. „Per person" is the part that was worth saying;
         * „daily" was the part that contradicted the sentence above it.
         */
        'ეს ზღვარი ერთ ადამიანზეა, რომ არავის გადატვირთოს, და თანდათან იხსნება — ყოველი ' +
        'კითხვა 24 საათის შემდეგ ცვივა. „განულდება", „ხვალ" ან „როცა ლიმიტი განახლდება" ' +
        'არ დაწერო: მომენტი, როცა ეს ერთბაშად ხდება, არ არსებობს. ერთი ხაზით უთხარი ' +
        'მფლობელს, ვისი ზღვარია და რატომ. ეს ამ ადამიანის გადაწყვეტილება არ არის.' +
        reopensLine(toName, reopensAt) +
        NOT_THE_OWNERS_LIMIT +
        CONTINUE_BY_OTHER_ROUTES +
        PROMISE_NO_ANSWER,
    };
  }

  // The plan in force decides (Ticket 10 Task 21, D119). A person on the
  // plan's never_contact list is refused on EVERY route, relays included — the
  // user said never. A person the plan does not name is a change to the plan:
  // refused with the instruction to propose one, while the people the plan
  // does name keep being written to. A goal without a plan keeps the old rule.
  // Row 251: an accepted introduction is the TARGET's own yes, relayed by
  // somebody who knows them both, and it counts for THIS goal only. Loaded
  // beside the plan so the two arrive together.
  const [planRow, acceptedPhones] = await Promise.all([
    planRowFor(taskId),
    acceptedIntroductionPhones(taskId, fromUserId),
  ]);
  const verdict = planAllows(planInForce(planRow), contactPhone, acceptedPhones);
  if (!verdict.allowed && verdict.reason === 'never_contact') {
    return {
      sent: false,
      reason: 'never_contact',
      error:
        `${toName} მფლობელის გეგმაში „ვის არასდროს" სიაშია — მას არაფერს ვწერთ, არც ამ და არც ` +
        'სხვა გზით. მფლობელს უთხარი, რომ ეს მისი გეგმის წესია და სხვა ადამიანი შესთავაზე.',
    };
  }
  if (
    !verdict.allowed &&
    parentAskId === undefined &&
    !(await ownerNamedThemOutsidePlan(threadId, taskId, fromUserId, contactPhone))
  ) {
    return {
      sent: false,
      reason: 'outside_plan',
      error:
        `${toName} დამტკიცებულ გეგმაში არ არის. ეს გეგმის ცვლილებაა: propose_task_plan-ით ` +
        'შესთავაზე მფლობელს განახლებული სია (ის, რაც უკვე დამტკიცებულია, უწყვეტად გრძელდება), ' +
        'დაელოდე „კი"-ს და მხოლოდ მერე მისწერე. სიაში მყოფ ადამიანებს ახლავე შეგიძლია მისწერო.',
    };
  }

  // Is this goal already in a live conversation with this person? If it is,
  // the message continues it (ticket 9 task 12) — same thread on their phone,
  // a different budget, and no new thread row in their list. The old rule
  // ("one task never asks the same person twice") is what stopped Lika from
  // sending Tornike the hour they had just agreed on.
  const live = await query<{
    ask_thread_id: number | null;
    status: string;
    from_user_id: string;
    seconds_ago: number;
  }>(
    `SELECT ask_thread_id, status, from_user_id::text AS from_user_id,
            EXTRACT(EPOCH FROM (NOW() - created_at))::int AS seconds_ago
     FROM task_asks
     WHERE task_id = $1 AND to_user_id = $2 AND status IN ('sent', 'answered')
     ORDER BY id DESC LIMIT 1`,
    [taskId, toUserId],
    ASK_QUERY_TIMEOUT_MS,
  );
  const liveThreadId = live.rows[0]?.ask_thread_id ?? null;

  /**
   * Row 205 — one approval, the same person, the same question twice, seconds
   * apart.
   *
   * Every pair on record, read off `task_asks`:
   *
   *   goal 5580 -> 144942   12:52:40 · 12:53:21    41s
   *   goal 4627 -> 13927    14:23:29 · 14:23:50    21s
   *   goal 4627 -> 575      14:23:29 · 14:23:49    20s
   *   goal 4627 -> 118509   14:23:29 · 14:23:50    21s
   *
   * THE TWO QUESTIONS ARE NEVER THE SAME STRING, and that is the part that
   * decides the shape of this guard. „იცნობ სანდო ბუღალტერს მცირე ბიზნესისთვის
   * თბილისში?" and „იცნობ სანდო ბუღალტერს ან საბუღალტრო კომპანიას თბილისში,
   * მცირე ბიზნესის…" are one question reworded — the model trying again, not a
   * person adding something. A dedupe on the text would have caught none of
   * the four, which is why I measured before writing one.
   *
   * So the discriminator is TIME AND SILENCE, not wording: an ask to somebody
   * who has not answered the one they were sent a minute ago is the same
   * question arriving twice, whatever words it wears.
   *
   * AND A LATER NUDGE STAYS LEGAL, deliberately. The four-a-day per-person cap
   * exists because a second message to somebody who has not replied is
   * sometimes right — it spends their patience and the budget charges it
   * there. What is never right is spending it twice inside one run. Ten
   * minutes is longer than any run this service allows and far shorter than a
   * human deciding to nudge.
   *
   * SAME SENDER ONLY. All four pairs are one account sending twice inside one
   * run. A relay arriving at the same person on the same goal from somebody
   * else is a different person asking, not the same question twice, and the
   * per-person receiving cap is what governs that.
   */
  const previous = live.rows[0];
  const secondsSincePrevious = previous?.seconds_ago;
  /**
   * ROW 259 — AND THE OWNER SPEAKING IS WHAT THE GUARD ABOVE COULD NOT SEE.
   *
   * The seat, 23 September, goal 9736. Ask 4555 went at 13:53:19. The owner
   * then typed „Tell Netai Test 7 that Thursday afternoon works for me" at
   * 13:54:05 and „The electrician visit." at 13:55:00. The send at 13:55:12
   * was refused as a duplicate — 113 seconds — and THE OWNER'S OWN WORDS NEVER
   * REACHED THE PERSON. The assistant kept them in the brief and said so,
   * which is honest and is not the same as delivering them.
   *
   * The guard above chose time and silence over wording, and the measurement
   * behind that choice still stands: all four historical duplicates were the
   * model rewording its own question, and a text comparison would have caught
   * none of them. So the answer is not to compare the text.
   *
   * IT IS TO ASK WHETHER THE PERSON WHOSE NAME IS ON THE MESSAGE HAS SAID
   * ANYTHING SINCE. Measured across every pair on record before writing it:
   *
   *     goal 4627  ask 2050  20s after 2049   owner spoke between:  0
   *     goal 4627  ask 2051  21s              owner spoke between:  0
   *     goal 4627  ask 2052  21s              owner spoke between:  0
   *     goal 5580  ask 2246  40s after 2245   owner spoke between:  0
   *     goal 9736  the refused one, 113s      owner spoke between:  2
   *
   * Clean on all five. The four the guard exists for are a model firing twice
   * inside one run with nobody adding anything; the one it should not have
   * caught is a person typing a new sentence.
   *
   * `kind = 'message'` and a non-empty body, because `role = 'user'` also
   * carries the engine's own `[მოვლენა]` event lines and the empty rows a
   * button press leaves. An event is the product talking to itself and must
   * not unlock a send.
   *
   * AND THE CAPS STILL GOVERN WHAT THIS OPENS. A person may receive two asks a
   * day from everyone; the plan still decides who may be written to at all.
   * This removes one refusal, not a budget.
   */
  const ownerAddedSomething =
    previous !== undefined &&
    secondsSincePrevious !== undefined &&
    (await ownerSpokeSince(taskId, secondsSincePrevious));
  if (
    previous?.status === 'sent' &&
    previous.from_user_id === fromUserId &&
    secondsSincePrevious !== undefined &&
    secondsSincePrevious < DUPLICATE_ASK_WINDOW_SECONDS &&
    !ownerAddedSomething
  ) {
    return {
      sent: false,
      reason: 'duplicate_ask_in_flight',
      error:
        `${toName}-ს ეს კითხვა ამ მიზანზე უკვე გაუგზავნე ${secondsSincePrevious} წამის წინ და ` +
        'პასუხი ჯერ არ მოსულა — მეორედ არ გაუგზავნო. სხვა სიტყვებით გადაკეთებაც იგივე ' +
        'კითხვის მეორედ მიღებაა მისთვის. დაელოდე პასუხს; სანამ ელოდები, ამავე გაშვებაში ' +
        'გააგრძელე სხვა ადამიანებით, მეორე წრით და ვებით.' +
        PROMISE_NO_ANSWER,
    };
  }
  /**
   * „They answered, so this is a new round" — and nobody checked that they had.
   *
   * The seat, 18 September, read off task_asks. One approval, two asks, same
   * person, same thread, forty-one seconds apart, the second marked
   * is_follow_up TRUE:
   *
   *   ask 2245  12:52:40  is_follow_up false
   *   ask 2246  12:53:21  is_follow_up true
   *
   * and the same shape the day before at three times the width: three people
   * each sent the same question twice, twenty seconds apart, off one approval.
   *
   * Nobody on earth had read the first message. What they received, in their
   * own language, in their own chat window, was „X's assistant WROTE AGAIN"
   * followed by the identical question. The comment on the badge reset below
   * says it out loud — „their last reply closed the previous round" — and that
   * was never tested, because the lookup accepted status 'sent' as readily as
   * 'answered'. A question nobody has replied to is not a conversation; it is
   * an unanswered question.
   *
   * So the two things that were one are now two:
   *
   *   WHICH THREAD  — unchanged, from 'sent' or 'answered'. The same room is
   *                   right either way: two threads for one exchange put the
   *                   answer and the question that followed it in different
   *                   rooms (ticket 9 task 12), and that stays fixed.
   *   IS IT A NEW   — only if they actually answered. This governs the „wrote
   *   ROUND         again" wording, the skipped introduction, and the badge.
   *
   * The BUDGET deliberately follows the thread rather than the answer: a
   * second message to somebody who has not replied still spends their
   * patience, and it must not spend a fresh outreach slot on a person who has
   * already been approached. Patience is what is being spent, so patience is
   * what it is charged to.
   */
  // Row 259: a second message the owner's own new words asked for is a
  // FOLLOW-UP, not a first ask — the recipient is told „wrote again", which is
  // exactly what happened, and the badge maths stays honest.
  const isFollowUp = live.rows[0]?.status === 'answered' || ownerAddedSomething;
  const sameThread = liveThreadId !== null;

  // Budgets: server-side, same relay exemption as the permission gate above.
  // Outreach spends the monthly growth budget; a follow-up spends the
  // recipient's patience instead, capped per person per goal per day.
  if (parentAskId === undefined) {
    const budget = sameThread
      ? await checkFollowUpBudget(fromUserId, toUserId, taskId)
      : await checkAskBudget(fromUserId, threadId);
    if (!budget.allowed) {
      const refusal = RELAY_REFUSALS[budget.reason ?? 'monthly_budget_reached'];
      return { sent: false, reason: refusal.reason, error: refusal.error(toName) };
    }
  }

  const sentToday = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM task_asks
     WHERE from_user_id = $1::int AND created_at > NOW() - INTERVAL '24 hours'`,
    [fromUserId],
    ASK_QUERY_TIMEOUT_MS,
  );
  if (Number(sentToday.rows[0]?.count ?? 0) >= MAX_ASKS_PER_SENDER_PER_DAY) {
    return {
      sent: false,
      reason: 'daily_cap_reached',
      error:
        'ამ ანგარიშიდან ბოლო 24 საათში გაგზავნილმა კითხვებმა ზღვარს მიაღწია — ეს ზღვარი ' +
        'მოძრავ 24 საათზეა, არა კალენდარულ დღეზე. ასევე დაწერე: „ბოლო 24 საათში". „დღეს" ' +
        'არ დაწერო — არც მაშინ იქნება სიმართლე, როცა წერ, არც მოგვიანებით. ეს გაგზავნის ' +
        'სიხშირის დაცვაა, არა მფლობელის ბალანსი.' +
        NOT_THE_OWNERS_LIMIT +
        CONTINUE_BY_OTHER_ROUTES +
        PROMISE_NO_ANSWER,
    };
  }

  const fromName = await query<{ name: string | null }>(
    `SELECT name FROM "User" WHERE id = $1::int LIMIT 1`,
    [fromUserId],
    ASK_QUERY_TIMEOUT_MS,
  );
  // Trimmed: a trailing space in the stored name rendered as "**Name **" on
  // the recipient's phone (ticket 3 §6.3).
  /**
   * The RECIPIENT's language, read from their own words anywhere — this thread
   * may not exist yet, and when it does it is empty. Who is asking has no
   * bearing on what the reader can read. Georgian on a failure and for a
   * member who has never written anything, which is what this always was.
   */
  const language = await userLanguage(String(toUserId)).catch(() => 'ka' as RunLanguage);
  const senderName = fromName.rows[0]?.name?.trim() || unknownSenderName(language);

  // The question crosses accounts — scrub it.
  const safeQuestion = scrubText(trimmed);
  // A follow-up lands in the conversation it belongs to; only a first ask
  // opens a thread. Two threads for one exchange would put the answer and the
  // question that followed it in different rooms (ticket 9 task 12).
  const askThreadId =
    liveThreadId ?? (await openAskThread(toUserId, senderName, safeQuestion, language));
  // Two members of one network who never saved each other's number (Ticket
  // 10 Task 23, D121): the recipient's opening line says so (D57) — that is
  // what makes a stranger's question a colleague's rather than spam.
  const roster = sameThread
    ? null
    : await sharedRoster(fromUserId, String(toUserId)).catch(() => null);
  // The three openings, the roster clause and the „reply here" tail all live in
  // askOpening.ts now — one per language, because the Georgian one inflects the
  // sender's name and no other language has anything to inflect.
  /**
   * Row 254: the frame has always been the reader's; now the question is too.
   * Composed HERE, where the frame's language is chosen, so the two can never
   * disagree — and `questionForReader` returns the asker's own words unchanged
   * on every failure, so the worst case is exactly today's behaviour.
   */
  const relayed = await questionForReader(safeQuestion, language);
  const opening = buildAskOpening(
    language,
    senderName,
    roster,
    relayed.text,
    isFollowUp ? 'followUp' : sameThread ? 'added' : 'first',
  );
  if (relayed.original !== undefined) {
    // eslint-disable-next-line no-console
    console.log(`[ask-relay] ask thread ${askThreadId}: question translated for the reader`);
  }
  /**
   * ROW 274 — the decline arrives with the question, not after it.
   *
   * ROW 300 made it three: yes / decline / later (see `askChoices`). What
   * follows is why the decline came first. What they had no
   * way to do was say NO in a form the product could record — so of 92 answers
   * on the live base, about 8 READ as refusals and none of them counted as
   * one. „About" was the whole problem.
   *
   * ⚠️ IT WENT TO TEST SEATS ONLY FOR HALF A DAY, and the reason it stopped
   * is worth keeping. I shipped it live, then realised I had no idea whether
   * the client treats choices as „these are the only options" — which would
   * turn a question into a multiple-choice form and leave the reader unable to
   * type at all, worse than no button. So it went to seats while I asked.
   *
   * The front-end answered by READING THEIR OWN CODE rather than guessing:
   * buttons draw under the bubble, the text field lives in the composer at the
   * foot of the screen, and `choices` does not touch it — it is disabled only
   * by a token limit or a rate limit. One button behaves exactly like two.
   *
   * They added one thing I had not thought of: a button disappears when the
   * next message matches an offered label EXACTLY. So somebody who TYPES the
   * sentence instead of tapping it lands in the same place — and the string
   * compare on this side catches both. The two paths agree by construction.
   */
  // Plate v301 G4: on a first ask about a need, the reader's own fitting
  // contacts become the buttons (see bridgePicker.ts).
  const picker =
    bridgeNeed && !sameThread ? await pickerFor(String(toUserId), bridgeNeed, language) : null;
  // G5 second half: a person an earlier answer on this goal named is told who
  // recommended them (see recommendedBy.ts).
  const recommender = sameThread ? null : await recommenderFor(taskId, toUserId, toName);
  const lines = [
    opening,
    ...(recommender ? [recommendedByLine(language, recommender)] : []),
    ...(picker ? [picker.line] : []),
  ];
  await saveThreadMessage(
    askThreadId,
    toUserId,
    'assistant',
    lines.join('\n\n'),
    'message',
    null,
    picker ? picker.choices : askChoices(language),
  );
  // The badge on a continued conversation goes back to waiting-on-them —
  // something has just been asked of them, whether or not they answered the
  // last one. The old comment here said „their last reply closed the previous
  // round", which was the assumption nobody checked.
  if (sameThread) {
    await setThreadStatus(String(toUserId), askThreadId, 'needs_you', {
      statusLine: RUN_STRINGS[language].statusLines.needs_you,
      isTask: true,
    });
  }

  // origin_thread_id is the SENDER's side; ask_thread_id above is the
  // recipient's. Ask 727 rides on a goal whose title has nothing to do with
  // its question, and answering "why" took a reconstruction across two threads
  // because the conversation an ask came out of was never written down
  // (ticket 9 task 20 d).
  // origin_user_id is the account that PAYS for the chain (Ticket 10 Task 25
  // (a), D123): a direct ask starts with its sender, a relay inherits its
  // parent's origin. The helper's assistant then runs on the origin's wallet.
  const originUserId = await chainOriginFor(fromUserId, parentAskId);
  const ask = await query<{ id: number }>(
    `INSERT INTO task_asks (task_id, from_user_id, to_user_id, question, ask_thread_id,
                            parent_ask_id, origin_thread_id, is_follow_up, origin_user_id,
                            wave_no)
     VALUES ($1, $2::int, $3, $4, $5, $6, $7, $8, $9::int, $10)
     RETURNING id`,
    [
      taskId,
      fromUserId,
      toUserId,
      safeQuestion,
      askThreadId,
      parentAskId ?? null,
      threadId ?? null,
      isFollowUp,
      originUserId,
      isFollowUp ? null : waveNo,
    ],
    ASK_QUERY_TIMEOUT_MS,
  );
  if (waveNo !== null && !isFollowUp) {
    void noteWaveAsk(taskId).catch((err: unknown) =>
      // eslint-disable-next-line no-console
      console.warn(`[ask] task ${taskId}: next wave time not noted:`, (err as Error).message),
    );
  }
  // Ticket 13 Task 42 (7): the same goal now asks a DIFFERENT person than it
  // asked before — the requester rerouted. Recorded once per goal.
  if (!sameThread) void recordReroutedIfSecondRoute(fromUserId, taskId, toUserId);
  // The tester's 983: a question held by the recipient's limit went after all.
  void releaseHeldAsk(taskId, toUserId).catch((err: unknown) =>
    // eslint-disable-next-line no-console
    console.warn(
      `[ask] task ${taskId}: could not release a held question:`,
      (err as Error).message,
    ),
  );

  // Ticket 10 Task 22 (D120): the recipient may already have said how this
  // kind of question is to be answered. A first question that one of their
  // standing rules covers is answered from it now — the ask row says so, the
  // recipient is told in their own thread, and the weekly summary lists it.
  // A follow-up inside a live conversation is never automatic: the rule was
  // approved for a question, not for a conversation.
  if (!isFollowUp) {
    const rule = await matchAnswerRule(toUserId, safeQuestion).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[answer-rule] match failed:', (err as Error).message);
      return null;
    });
    if (rule) {
      await answerAutomatically(ask.rows[0].id, askThreadId, String(toUserId), rule, safeQuestion);
      return { sent: true, ask_id: ask.rows[0].id, to_name: toName, answered_automatically: true };
    }
  }

  void sendPushNotification(String(toUserId), {
    title: askPushTitle(language, senderName),
    body: safeQuestion.slice(0, 120),
    url: `/chat/${askThreadId}`,
  }).catch(() => undefined);

  // D49: a relayed ask reaching 'sent' arms the asker's 3-day debrief — if
  // it is still unanswered by then, the asker hears about it honestly. An
  // answered ask is dropped at release time. Best-effort: the send stands.
  await armAskDebrief(fromUserId, ask.rows[0].id, taskId, toName, isFollowUp).catch(
    (err: unknown) =>
      // eslint-disable-next-line no-console
      console.error('[debrief] ask arm failed:', (err as Error).message),
  );

  return { sent: true, ask_id: ask.rows[0].id, to_name: toName };
}

/**
 * Answer an ask from the recipient's standing rule: the answer is recorded
 * exactly as the rule holds it, the row is marked automatic, the recipient is
 * told in their own thread what went out and under which rule, and the asker's
 * goal is woken the same way a typed answer wakes it.
 */
async function answerAutomatically(
  askId: number,
  askThreadId: number,
  recipientUserId: string,
  rule: AnswerRule,
  question: string,
): Promise<void> {
  // The recipient's own language, like the wrapper above it in the same thread.
  const ruleLanguage = await userLanguage(String(recipientUserId)).catch(() => 'ka' as RunLanguage);
  // D652: worded afresh at every send, with the helper's facts exact.
  const answerText = await ruleAnswerInOwnWords(
    rule.answer,
    question,
    ruleLanguage,
    recipientUserId,
  );
  const captured = await recordAskAnswer(askThreadId, answerText);
  if (!captured) return;
  await query(
    `UPDATE task_asks SET automatic = TRUE, answer_rule_id = $2 WHERE id = $1`,
    [askId, rule.id],
    ASK_QUERY_TIMEOUT_MS,
  );
  await recordRuleUse(rule.id).catch(() => undefined);
  await saveThreadMessage(
    askThreadId,
    Number(recipientUserId),
    'assistant',
    answeredByYourRule(ruleLanguage, rule.kind, answerText),
  );
  // Row 233: the close used to live here and ONLY here, which is why a typed
  // answer never got one. It is now in `deliverCapturedAnswer`, which both
  // paths go through.
  await deliverCapturedAnswer(captured, recipientUserId);
}

/**
 * Capture the recipient's plain-text reply. The FIRST message answers the ask
 * (sent → answered) and reports which task to wake; later messages append to
 * the answer without re-waking.
 */
export interface CapturedAnswer {
  askId: number;
  taskId: number;
  /** The recipient's own thread — the one whose badge has to stop asking. */
  askThreadId: number;
  firstAnswer: boolean;
  answer: string;
  /**
   * Is this text in the stored answer? Not when the asker's wake had already
   * been delivered: the append window was closed and the line was dropped.
   */
  carried: boolean;
  /** Who answered — the wake event names them (ticket 4 item 0C.3). */
  fromName: string | null;
}

export async function recordAskAnswer(
  askThreadId: number,
  answerText: string,
): Promise<CapturedAnswer | null> {
  const safe = scrubText(answerText.trim());
  if (!safe) return null;
  // Append-window rule (ticket 6 protocol run, task 46): later messages join
  // the answer ONLY until the asker's wake is delivered. After that, whatever
  // the recipient says in this thread is conversation with their own courier
  // agent — an opt-out negotiation appended itself onto ask 829's answer and
  // the verbatim-quote rule would have relayed it into the asker's thread.
  // The LATEST live ask on the thread, not "an" ask: since ticket 9 task 12 a
  // thread can carry several rounds of the same conversation, and round two's
  // answer belongs to round two's question. Without the ordering, one reply
  // would have overwritten every round at once.
  const updated = await query<{ id: number; task_id: number; answer: string }>(
    // Ticket 20 row 115: the same line does not join the answer twice.
    //
    // 16 September, ask 1783: Ninia's „კი" arrived five times in six seconds —
    // five runs, five „გაიგზავნა" replies, and the stored answer became „კი"
    // five times over, joined by newlines. That is what the asker's goal was
    // then woken with.
    //
    // The append window is right and stays: a person genuinely adding a second
    // name after their first answer must have it carried. What is wrong is
    // appending text that is already there word for word. Compared against the
    // answer's existing LINES rather than with LIKE, so nothing in the text
    // has to be escaped and a line that merely contains an earlier one still
    // counts as new.
    `UPDATE task_asks
     SET answer = CASE
           WHEN answer IS NULL THEN $2
           WHEN wake_delivered_at IS NULL
                AND NOT ($2 = ANY(string_to_array(answer, E'\n')))
             THEN answer || E'\n' || $2
           ELSE answer
         END,
         status = CASE WHEN status = 'sent' THEN 'answered' ELSE status END,
         answered_at = COALESCE(answered_at, NOW()),
         -- #1684 (tester 41786): somebody who answered had seen the question.
         seen_at = COALESCE(seen_at, NOW()),
         -- ROW 274: the button's own sentence, compared exactly ($3 is decided
         -- in TypeScript by string equality, never by judging the words). A
         -- decline stays ANSWERED on purpose — the asker's question IS
         -- resolved and their goal must wake — so all six readers of status go
         -- on being right; this column is the part they could not see.
         --
         -- (No backtick anywhere in here: this SQL lives in a template literal
         -- and one ends the string. Seventh time this week.)
         --
         -- COALESCE, so a later line in the same round cannot un-decline it:
         -- if somebody taps the button and then types a name after all, the
         -- name is appended to the answer and the asker gets it, and the
         -- refusal that WAS said stays said.
         declined_at = CASE WHEN $3 THEN COALESCE(declined_at, NOW()) ELSE declined_at END
     WHERE id = (
       SELECT id FROM task_asks
       WHERE ask_thread_id = $1 AND status IN ('sent', 'answered')
       ORDER BY id DESC LIMIT 1
     )
     RETURNING id, task_id, answer`,
    [askThreadId, safe, isDeclineChoice(safe)],
    ASK_QUERY_TIMEOUT_MS,
  );
  const row = updated.rows[0];
  if (!row) return null;
  // firstAnswer = this message IS the whole stored answer, i.e. the round had
  // nothing before it. Read off the updated row itself.
  const firstAnswer = row.answer === safe;
  // Contains, not equals a line: a shared number with the owner's note is two lines.
  const carried = row.answer.includes(safe);
  const check = await query<{ from_name: string | null }>(
    `SELECT ${ASKED_AS_THE_ASKER_SAVED_THEM} AS from_name
     FROM task_asks ta
     WHERE ta.id = $1 LIMIT 1`,
    [row.id],
    ASK_QUERY_TIMEOUT_MS,
  );
  // The scrubbed verbatim text rides back so the wake event can carry it —
  // ticket 3 §5: the asker-side agent once presented the thread TITLE as the
  // answer; giving it the exact words in the event kills that failure mode.
  return {
    askId: row.id,
    taskId: row.task_id,
    // Row 233: carried so `deliverCapturedAnswer` can close the thread without
    // its caller having to remember to — which is precisely what one of the
    // two callers did not do.
    askThreadId,
    firstAnswer,
    answer: safe,
    carried,
    fromName: check.rows[0]?.from_name ?? null,
  };
}

/**
 * Ticket 7 Task 1(c), founder's ruling D48: nothing leaves an incoming-ask
 * thread on its own. This is now the ONLY path an answer takes to the asker —
 * the recipient's assistant composes the text, shows it, and calls this with
 * the exact wording the recipient approved. The old path (the recipient's
 * first raw message auto-captured as the answer before the assistant even
 * ran — asks 892/925's answered_at preceding their own message rows) is
 * removed from threads.routes.
 *
 * Scoped to the recipient: the ask behind this thread must be addressed TO
 * the caller — the thread id comes from server context, but the ownership
 * check stays as belt-and-braces.
 */
export interface SentAnswer {
  readonly sent: boolean;
  readonly error?: string;
  /** The answer had already reached the asker; this later text did not. */
  readonly already_delivered?: boolean;
  readonly rule_saved?: boolean;
  readonly rule_error?: string;
}

/**
 * Tester 39931: a helper answered at 17:49, the asker got it, and at 19:29 she
 * sent a number on the same question. The append window was closed, the line
 * was dropped — and the tool still said „sent", so Netai told her the number
 * had gone. Nothing arrived. Now the tool says what happened.
 */
const ALREADY_DELIVERED_ERROR =
  'Not sent: this question was already answered and that answer has reached the asker; a ' +
  'later message on it does not travel. Tell the owner so in one line; if they want the asker ' +
  'to have more, the asker can ask again.';

export async function sendApprovedAskAnswer(
  recipientUserId: string,
  askThreadId: number,
  approvedText: string,
  // Ticket 10 Task 22 (D120): the second thing the confirm turn asks — "and
  // answer similar questions this way in future". Given only on the user's
  // explicit yes to THAT; the rule is written after the answer has gone.
  remember?: { kind?: string; verbatim?: boolean },
): Promise<SentAnswer> {
  const ask = await query<{ to_user_id: number; status: string; question: string }>(
    `SELECT to_user_id, status, question FROM task_asks
     WHERE ask_thread_id = $1 ORDER BY id DESC LIMIT 1`,
    [askThreadId],
    ASK_QUERY_TIMEOUT_MS,
  );
  const row = ask.rows[0];
  if (!row || String(row.to_user_id) !== recipientUserId) {
    return { sent: false, error: 'ამ თრედს ცოცხალი შემოსული კითხვა არ აქვს.' };
  }
  if (row.status !== 'sent' && row.status !== 'answered') {
    return { sent: false, error: 'ეს კითხვა უკვე დახურულია — პასუხი ვეღარ გაიგზავნება.' };
  }

  // D648: the answer goes in the assistant's words, with the helper's facts
  // exact. #991: a shared number is sent exactly as built.
  const answerText = approvedText;
  if (remember?.verbatim !== true) {
    const heldBack = await answerHeldBack(askThreadId, row.question, answerText);
    if (heldBack !== null) return { sent: false, error: heldBack };
  }
  const captured = await recordAskAnswer(askThreadId, answerText);
  if (!captured) {
    return { sent: false, error: 'პასუხის ჩაწერა ვერ მოხერხდა — სცადე ხელახლა.' };
  }
  if (!captured.carried) {
    return { sent: false, already_delivered: true, error: ALREADY_DELIVERED_ERROR };
  }

  await deliverCapturedAnswer(captured, recipientUserId);

  if (remember?.kind === undefined) return { sent: true };
  const saved = await saveAnswerRule(recipientUserId, remember.kind, row.question, answerText);
  return saved.ok
    ? { sent: true, rule_saved: true }
    : { sent: true, rule_saved: false, rule_error: saved.error };
}

/**
 * What every answer does once it is recorded, typed or automatic: the pair's
 * warmth, and the asker's goal woken with the exact text.
 */
async function deliverCapturedAnswer(
  captured: CapturedAnswer,
  recipientUserId: string,
): Promise<void> {
  /**
   * Row 233 — THE PERSON WHO ANSWERED WAS STILL BEING ASKED.
   *
   * Thread 21509, account 171940, read from the live table at 10:20 today:
   *
   *   09:19:14  ask 3664 sent, thread born `needs_you` / „Needs your answer"
   *   09:48:45  he ANSWERED it — task_asks.status = 'answered'
   *   09:49:23  the thread's last update … still `needs_you`
   *
   * And it still says it. Compare 21510, the ask the recipient's opt-out
   * cancelled: `done`. So the CANCEL path cleared the badge and the ANSWER
   * path did not.
   *
   * The close existed — in `answerAutomatically`, the standing-rule branch, and
   * nowhere else. A person who answers by TYPING, which is every ordinary
   * answer, kept a chat asking them for something they had already given.
   *
   * It goes HERE because this function's own comment already claimed the
   * ground: „what every answer does once it is recorded, typed or automatic".
   * It was true of the warmth and the wake and false of the badge. Both
   * callers pass through it, so neither can forget again — which is how the
   * typed path came to be missing it in the first place.
   *
   * Every answer, not only the first: a second message appending to an answer
   * must not reopen a thread that is finished, and closing a closed thread
   * costs one idempotent write.
   */
  await setThreadStatus(recipientUserId, captured.askThreadId, 'done', { isTask: true });

  // Two people who write back to each other have a real tie — the founder's
  // own third source of warmth (ticket 9 task 13.1). Evidence about the PAIR,
  // so it lands on both sides. Best-effort: the answer is what matters here.
  const asker = await query<{ from_user_id: number }>(
    `SELECT from_user_id FROM task_asks WHERE id = $1 LIMIT 1`,
    [captured.askId],
    ASK_QUERY_TIMEOUT_MS,
  );
  const askerId = asker.rows[0]?.from_user_id;
  if (askerId !== undefined) {
    void recordMutualWarmth(
      String(askerId),
      recipientUserId,
      'ask_answered',
      `ask_${captured.askId}`,
    ).catch((err: unknown) =>
      // eslint-disable-next-line no-console
      console.error('[warmth] ask answer failed:', (err as Error).message),
    );
  }

  // Instant wake with the EXACT approved text; the 5-minute unwoken-answer
  // sweep stays as the backstop if this delivery fails. Dynamic import
  // because taskEngine statically imports this file — a static import back
  // would be a load-order cycle.
  if (captured.firstAnswer) {
    // Ticket 19 G10 / D254: whether this answer came back through a bridge
    // changes what the asker is told and means one person is owed a thank-you.
    const relay = await relayShapeOf(captured.askId);
    /**
     * THE HELPER WAS BEING MADE TO WAIT FOR A STRANGER'S ASSISTANT TO THINK.
     *
     * `wakeTask` is a whole run on the ASKER's side — model, tools, reply. It
     * was awaited here, inside the tool call the HELPER's phone is waiting on,
     * so the person who pressed „send" sat with a spinner until somebody
     * else's conversation had finished. Measured on `tool_call_log`, all
     * users, and it is not new — it has been like this since 17 September:
     *
     *     17 Sep   p50 23,454 ms
     *     18 Sep   p50 32,800 ms      worst 51,528
     *     22 Sep   p50 32,351 ms      worst 53,004
     *     23 Sep   p50 30,062 ms      worst 53,167
     *
     * Half a minute, every time, for the one act in this product that is pure
     * generosity: answering a stranger's question for them.
     *
     * NOTHING WAITS ON THE RESULT. The tool returns `{ sent: true }` and no
     * caller reads the wake's outcome — „sent" means recorded and on its way,
     * which is exactly what it now means.
     *
     * AND THE BACKSTOP IS REAL, not a hope: `sweepUnwokenAnswers` runs every
     * five minutes over every answered ask with `wake_delivered_at IS NULL`,
     * and marks one delivered ONLY on success. I checked that before changing
     * this rather than trusting the comment that claimed it. So the worst case
     * of a failed background wake is the asker hearing five minutes later —
     * which is already the worst case today, because a failure here is caught,
     * logged and left to the same sweep.
     */
    void (async () => {
      try {
        const { wakeTask, deliverAnswersWhenFree } = await import('./taskEngine.service');
        /**
         * ⚠️ ROW 322, THIRD PASS — A LINE IN THE EVENT DID NOT BIND THE MODEL.
         *
         * The seat's 859: the single live event carried „never say the others
         * have not answered", and the reply still said „Still waiting on Test
         * 54 and Test 56" — Test 54's answer was already in the table when the
         * run started. So the server no longer relies on the sentence: a
         * direct answer is delivered through the batch, after the same short
         * settle every retry uses, and that event carries EVERY answer the
         * goal is owed. An answer already in the table cannot be missing from
         * it. A relayed answer keeps its own event — it names the bridge and
         * thanks them, which the batch does not.
         */
        if (!relay) {
          deliverAnswersWhenFree(captured.taskId);
          return;
        }
        // D648: the helper's meaning in the assistant's words, never a quotation.
        const verbatim = false;
        // Row 322(a) for a relayed answer: on the owner's screen first, naming
        // the bridge, and the reply that follows does not read it out again.
        const delivered = (await showRelayedAnswer(captured, relay.bridgeName, verbatim))
          ? await wakeTask(
              captured.taskId,
              buildShownRelayAnswerWakeEvent(captured.fromName, relay.bridgeName),
            )
          : await wakeTask(
              captured.taskId,
              buildRelayAnswerWakeEvent(
                captured.answer,
                captured.fromName,
                relay.bridgeName,
                verbatim,
              ),
              { text: captured.answer, who: captured.fromName, verbatim },
            );
        if (delivered === 'woken') await markAskWakeDelivered(captured.askId);
        // Row 322: a busy thread is usually the previous answer's own wake.
        // Come back as soon as it is free, with every answer still waiting.
        if (delivered === 'busy') deliverAnswersWhenFree(captured.taskId);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ask-wake] failed (sweep will retry):', (err as Error).message);
      }
    })();
    if (relay) {
      await closeTheBridgesOwnAsk(relay.parentAskId);
      await thankTheBridge(relay, captured.fromName);
    }
  }
}

/** Row 322(a): the card for one relayed answer. False when it could not be written. */
async function showRelayedAnswer(
  captured: CapturedAnswer,
  bridgeName: string | null,
  verbatim: boolean,
): Promise<boolean> {
  try {
    const goal = await query<{ thread_id: number | null; user_id: string }>(
      `SELECT thread_id, user_id FROM tasks WHERE id = $1 LIMIT 1`,
      [captured.taskId],
      ASK_QUERY_TIMEOUT_MS,
    );
    const threadId = goal.rows[0]?.thread_id ?? null;
    const ownerId = Number(goal.rows[0]?.user_id);
    if (threadId === null || !Number.isInteger(ownerId) || ownerId <= 0) return false;
    const { showAnswersToOwner } = await import('./answerCard.service');
    return await showAnswersToOwner({ threadId, ownerId }, [
      {
        askId: captured.askId,
        answer: captured.answer,
        fromName: captured.fromName,
        verbatim,
        viaName: bridgeName,
      },
    ]);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[answer-card] relayed answer: card not written:', (err as Error).message);
    return false;
  }
}

/**
 * Ticket 19 G10 / D254: the bridge's side of a relayed answer.
 *
 * The bridge is the person who was asked, said „ask Erekle, I will put you in
 * touch", and then — until now — heard nothing ever again. Their yes was the
 * whole of their involvement and the product treated it as the end of the
 * conversation, which is true for the work and wrong for the person.
 *
 * Null when the answered ask was not a relay, which is the ordinary case.
 */
interface RelayShape {
  /** The bridge's OWN ask — the one that is still open until this is closed. */
  readonly parentAskId: number;
  readonly bridgeUserId: number;
  readonly bridgeThreadId: number | null;
  readonly bridgeName: string | null;
}

async function relayShapeOf(childAskId: number): Promise<RelayShape | null> {
  const result = await query<{
    parent_ask_id: number;
    bridge_user_id: number;
    bridge_thread_id: number | null;
    bridge_name: string | null;
  }>(
    `SELECT p.id           AS parent_ask_id,
            p.to_user_id   AS bridge_user_id,
            p.ask_thread_id AS bridge_thread_id,
            b.name          AS bridge_name
       FROM task_asks c
       JOIN task_asks p ON p.id = c.parent_ask_id
       LEFT JOIN "User" b ON b.id = p.to_user_id
      WHERE c.id = $1
      LIMIT 1`,
    [childAskId],
    ASK_QUERY_TIMEOUT_MS,
  ).catch((err: unknown) => {
    // A failure here must not cost the asker their answer, which is already on
    // its way: the relay extras are the part that can be lost.
    // eslint-disable-next-line no-console
    console.error('[relay-close] could not read the relay shape:', (err as Error).message);
    return null;
  });
  const row = result?.rows[0];
  if (!row || row.bridge_thread_id === null) return null;
  return {
    parentAskId: row.parent_ask_id,
    bridgeUserId: row.bridge_user_id,
    bridgeThreadId: row.bridge_thread_id,
    bridgeName: row.bridge_name,
  };
}

/**
 * The bridge's own ask is finished the moment the relay it started is answered.
 *
 * FOUND BY THE SEAT, 21 September, in their 387, as a question rather than a
 * claim: „ask 3071 is still `sent`, `answered_at` NULL — after its recipient
 * answered, after the relay it spawned completed, and after the requester was
 * told." It is two of two: ask 2609 (19 September) is in the same state.
 *
 * WHY IT MATTERS, and it is worse than an untidy row. `getPendingAsksForUser`
 * selects `status = 'sent'`, so the BRIDGE goes on being shown a question
 * waiting for them — forever, on a thing they already helped with. They said
 * „ask Erekle", the relay went, Erekle answered, the asker was told, and the
 * product keeps telling the bridge somebody is waiting on them.
 *
 * WHY `answered` AND NOT A NEW STATUS. There are three — `sent`, `answered`,
 * `cancelled` — and six readers. `cancelled` would be a lie (nothing was
 * stopped) and a fourth status is a migration plus every one of those readers.
 * The word here means RESOLVED, not „the bridge typed an answer": the answer
 * column stays NULL on purpose, because C's words are C's and writing them
 * into B's ask would say B said them.
 *
 * AND `wake_delivered_at` IS SET IN THE SAME STATEMENT, which is the part that
 * would have bitten. `listUnwokenAnswers` picks up every row with
 * `status = 'answered' AND answered_at IS NOT NULL AND wake_delivered_at IS
 * NULL` and delivers its answer — so marking the parent answered WITHOUT this
 * would hand the backstop sweep a row whose answer is NULL, and wake the
 * asker's goal with nothing in it. The wake genuinely did happen; it happened
 * through the child.
 *
 * Best-effort, like the thank-you beside it: the asker's answer is already on
 * its way and must not be lost to a tidy-up failing.
 */
async function closeTheBridgesOwnAsk(parentAskId: number): Promise<void> {
  await query(
    `UPDATE task_asks
     SET status = 'answered',
         answered_at = COALESCE(answered_at, NOW()),
         wake_delivered_at = COALESCE(wake_delivered_at, NOW())
     WHERE id = $1 AND status = 'sent'`,
    [parentAskId],
    ASK_QUERY_TIMEOUT_MS,
  ).catch((err: unknown) =>
    // eslint-disable-next-line no-console
    console.error('[relay-close] could not close the bridge’s own ask:', (err as Error).message),
  );
}

/**
 * One line to the bridge, and nothing after it (D254).
 *
 * Written by the server rather than by a run, for the same reason the opening
 * line of an ask thread is: this is not a conversation to be continued, and a
 * run given the chance would offer to keep them posted — which is exactly what
 * the founder ruled against. It says the answer arrived and went where it was
 * going, names nothing the named person said, and ends.
 */
async function thankTheBridge(relay: RelayShape, namedName: string | null): Promise<void> {
  if (relay.bridgeThreadId === null) return;
  // The BRIDGE's own language — they are a third person in this exchange and
  // need not share a script with either side of it. Their own thread answers
  // that better than their account does, and falls back to the account when
  // the thread cannot say.
  const language = await threadLanguage(relay.bridgeThreadId).catch(() => 'ka' as RunLanguage);
  try {
    await saveThreadMessage(
      relay.bridgeThreadId,
      relay.bridgeUserId,
      'assistant',
      bridgeThanks(language, namedName),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[relay-close] thank-you to the bridge failed:', (err as Error).message);
  }
}

/**
 * ⚠️ ROWS 314, 315 AND 317 — „AGREED" WAS BEING REPORTED AS „CONNECTED",
 * AND THE NEXT QUESTION WAS „IS IT SOLVED?".
 *
 * Giorgi, 29 September: a bridge agreed to introduce him to a lawyer, and
 * Netai told him the connection „took place". No contact reached him and
 * nobody had spoken. The seat reproduced it on fictional seats the same
 * night: Test 44 typed „…დავაკავშირებ, თუ გინდა" and the owner's very next
 * reply was „ეს გითვლი მოგვარებულად? [მოგვარებულია / ჯერ არა]" — and nothing
 * was done to make the connection happen.
 *
 * Both answer events ended with „then continue the task" and nothing else, so
 * the model had to decide for itself what a yes-to-connect means, and it
 * decided it was the end. It is the middle. Three stages exist — agreed,
 * contact passed, they spoke — and only the last is a result.
 */
/**
 * Row 260, the owner's side: „if it is in another language, add a translation"
 * never said INTO WHAT, and on an English owner's goal the model translated an
 * English answer into Georgian — the language of this event, not of the owner.
 */
const INTO_OWNERS_LANGUAGE =
  'თარგმანი დაურთე მფლობელის ენაზე — იმ ენაზე, რომლითაც ის წერს, და არა ამ შეტყობინების ' +
  'ენაზე. მთელი პასუხიც მფლობელის ენაზე დაწერე.';

/**
 * Row 322, seat's 856: the FIRST relay of six near-simultaneous answers told
 * the owner „the other five have not answered yet" — they all had, within
 * seconds. The batched event already forbade that; the single one did not.
 */
const OTHERS_MAY_HAVE_ANSWERED =
  'სხვებმაც შეიძლება ახლახან უპასუხეს — მათი პასუხები ცალკე მოვა. მფლობელს არასდროს უთხრა, ' +
  'რომ დანარჩენებს ჯერ არ უპასუხიათ; თქვი მხოლოდ, ვინ უპასუხა.';

/** Row 303: what the owner's run is told when the text is not the answerer's own words. */
const REWORDED_ANSWER =
  'ეს მისი ზუსტი სიტყვები არ არის — ტექსტი მისმა ასისტენტმა ჩამოაყალიბა. მფლობელს გადაეცი ' +
  'აზრი, ბრჭყალების გარეშე და ისე, რომ არ ჩანდეს მის სიტყვებად („X-მა მითხრა, რომ…"), ' +
  'დაასახელე ვინ უპასუხა, და თუ სხვა ენაზეა, მფლობელის ენაზე გადმოეცი.';

const AGREED_IS_NOT_CONNECTED =
  'თუ პასუხი დათანხმებაა ვინმესთან დაკავშირებაზე („დაგაკავშირებ", „ვიცნობ, გაგაცნობ") — ეს ' +
  'ეტაპია „დათანხმდა", არა „დაკავშირდნენ". მფლობელს ზუსტად ეს უთხარი: ვინ დათანხმდა, ვისთან ' +
  'დასაკავშირებლად, და რომ კონტაქტი ჯერ არ გადაცემულა. არასდროს თქვა „დაგაკავშირეთ", „შედგა" ' +
  'ან „დაკავშირდით", და ამ ეტაპზე ნუ ჰკითხავ, მოგვარდა თუ არა. შენი შემდეგი ნაბიჯი ' +
  'დაკავშირების ბოლომდე მიყვანაა: ერთი ღილაკით შესთავაზე, რომ დათანხმებულს გაცნობა სთხოვო ' +
  '(request_introduction, შუამავალი — ის, ვინც დათანხმდა), და ერთი ხაზით თქვი, რა დარჩა. ' +
  'შემდეგ set_task_wake 24 საათზე, რომ მაშინ შეამოწმო, ისაუბრეს თუ არა. „მოგვარდა?" ' +
  'მხოლოდ მაშინ იკითხე, როცა კონტაქტი გადაცემულია და გამოყენებული, ან მფლობელი თავად ' +
  'იტყვის, რომ ისაუბრეს.';

/**
 * ⚠️ THE SAME RULE UNDER A CARD — AND WHY IT HAD TO BE A SECOND ONE (903).
 *
 * The rule above says „tell the owner exactly who agreed and with whom". Under
 * a card that sentence IS the retelling the card exists to remove, and the
 * seat's first count caught it: 19:45:16, „Netai Test 64 agreed to connect you
 * with Nino Beridze, an accountant…", directly under the card showing Test
 * 64's own words. Both rules were in one event and the model obeyed the older.
 * So the card's event carries this one: the same stage, the same next step,
 * and nothing that asks for who-said-what again.
 */
/**
 * The tester's 1121 (35436): „კი, პარასკევს 12-ზე, იმავე მისამართზე" agreed a
 * meeting, and the owner read only „tell me when this settles it". The card
 * shows the words; it does not say where „the same address" is. A meeting is
 * the outcome, so it is said once, in full — the one exception to „do not repeat".
 */
const MEETING_UNDER_CARD =
  ' თუ პასუხი შეხვედრას ადგენს (დღე, საათი ან ადგილი), ეს გამონაკლისია: ერთი წინადადებით ' +
  'სრულად უთხარი მფლობელს — ვისთან, როდის, სად და რა პირობით, „იმავე მისამართი" საუბრიდან ' +
  'ზუსტ მისამართად გახსენი.';

const AGREED_UNDER_CARD =
  'თუ ბარათზე რომელიმე პასუხი დათანხმებაა დაკავშირებაზე — ეს ეტაპია „დათანხმდა", არა ' +
  '„დაკავშირდნენ": არასდროს თქვა „დაგაკავშირეთ", „შედგა" ან „დაკავშირდით", და ნუ ჰკითხავ, ' +
  'მოგვარდა თუ არა. ვინ დათანხმდა და ვისთან — ბარათზე უკვე წერია, ნუ გაიმეორებ. შენი ერთი ' +
  'წინადადება შემდეგი ნაბიჯია: ერთი ღილაკით შესთავაზე, რომ დათანხმებულს გაცნობა სთხოვო ' +
  '(request_introduction, შუამავალი — ის, ვინც დათანხმდა). შემდეგ set_task_wake 24 საათზე.';

/**
 * The wake event when the answer came back through a bridge (D254).
 *
 * Three people are in this, and the owner knows only one of them: they asked
 * their own contact, their contact asked somebody else, and it is that somebody
 * else who has answered. An event that names only the answerer reads to the
 * owner as a stranger writing to them out of nowhere, so the path is named.
 *
 * And the founder's ruling on what happens next: on a yes, the owner is helped
 * to write the first message themselves — the product's job ends at the
 * introduction, and a warm one is worth more than a forwarded one.
 */
export function buildRelayAnswerWakeEvent(
  answer: string,
  fromName?: string | null,
  bridgeName?: string | null,
  verbatim = true,
): string {
  const who = fromName?.trim()
    ? geoName(fromName.trim(), 'erg')
    : 'ადამიანმა, ვისაც კითხვა გადაეგზავნა';
  const bridge = bridgeName?.trim() ? geoName(bridgeName.trim(), 'gen') : null;
  const path = bridge
    ? `${who} გიპასუხა — ის ${bridge} მეშვეობით იკითხა.`
    : `${who} გიპასუხა შენი კონტაქტის მეშვეობით.`;
  return (
    `${path} პასუხის ზუსტი ტექსტი <answer> ტეგებს შორისაა:\n` +
    `<answer>\n${answer}\n</answer>\n` +
    (verbatim
      ? 'მფლობელს გადაეცი სიტყვასიტყვით, ციტატად, დაასახელე ვინ უპასუხა და ვისი მეშვეობით — თუ ' +
        `პასუხი მფლობელის ენაზე არ არის, ${INTO_OWNERS_LANGUAGE} `
      : `${REWORDED_ANSWER} დაასახელე ვისი მეშვეობით. `) +
    'თუ პასუხი დათანხმებაა, შესთავაზე მფლობელს, რომ პირველი ' +
    'შეტყობინება თავად დაწეროს, და დაეხმარე ერთი-ორი წინადადებით — სწორედ იმაზე, რაც მას ამ ' +
    'შეხვედრიდან სჭირდება. თუ უარია, მოკლედ და თბილად თქვი და ნუ დაუბრუნდები. ' +
    `${OTHERS_MAY_HAVE_ANSWERED} ${AGREED_IS_NOT_CONNECTED} შემდეგ გააგრძელე დავალება.`
  );
}

/**
 * Row 322(a) — a relayed answer the server has ALREADY shown the owner, with
 * the bridge named on the card. What the run still owns is what only it can
 * do: thank the bridge in one clause and take the next step — never read the
 * answer out again.
 */
export function buildShownRelayAnswerWakeEvent(
  fromName?: string | null,
  bridgeName?: string | null,
): string {
  const who = fromName?.trim()
    ? geoName(fromName.trim(), 'erg')
    : 'ადამიანმა, ვისაც კითხვა გადაეგზავნა';
  const bridge = bridgeName?.trim() ? geoName(bridgeName.trim(), 'gen') : null;
  const path = bridge
    ? `${who} გიპასუხა — ის ${bridge} მეშვეობით იკითხა.`
    : `${who} გიპასუხა შენი კონტაქტის მეშვეობით.`;
  return (
    `${path} სერვერმა პასუხი ${ALREADY_ON_CARD} — ბარათად, შენი პასუხის ზემოთ, ვინ ` +
    'უპასუხა და ვისი მეშვეობით. პასუხის სიტყვები არ გაიმეორო; თუ უარია, ერთი თბილი ' +
    `წინადადება და ნუ დაუბრუნდები. ${AGREED_UNDER_CARD}${MEETING_UNDER_CARD} შემდეგ გააგრძელე დავალება.`
  );
}

/**
 * The wake event for an arrived answer. Tag-delimited, NOT quote-wrapped:
 * a quote inside the answer broke the quoted form and the asker received a
 * raw fragment (ticket 4 blocker 3, thread 8201). The responder is named
 * (item 0C.3): an answer that arrives anonymously reads as the assistant's own
 * curiosity, so the owner has no reason to treat it as someone waiting.
 */
export function buildAnswerWakeEvent(
  answer: string,
  fromName?: string | null,
  verbatim = true,
): string {
  const who = fromName?.trim() ? fromName.trim() : 'ადამიანმა, ვისაც კითხვა გაეგზავნა';
  return (
    `${who} გიპასუხა შენს გაგზავნილ კითხვაზე. პასუხის ტექსტი <answer> ტეგებს შორისაა:\n` +
    `<answer>\n${answer}\n</answer>\n` +
    (verbatim
      ? `მფლობელს გადაეცი სიტყვასიტყვით, ციტატად, და დაასახელე ვინ უპასუხა (${who}) — თუ ` +
        `პასუხი მფლობელის ენაზე არ არის, ${INTO_OWNERS_LANGUAGE} `
      : `${REWORDED_ANSWER} `) +
    'თუ ეს პასუხი კითხვაა, მფლობელს ახსენი, რომ ადამიანი პასუხს ელოდება. ' +
    `${OTHERS_MAY_HAVE_ANSWERED} ${AGREED_IS_NOT_CONNECTED} შემდეგ გააგრძელე დავალება.`
  );
}

/** One answer inside a batched wake (row 322). */
export interface ArrivedAnswer {
  readonly answer: string;
  readonly fromName: string | null;
  readonly verbatim: boolean;
  /** The answerer's assistant already passed the question on to someone else. */
  readonly passedOn?: boolean;
}

/**
 * The tester's 1108 (33509 / 33496): the helper answered „I don't know, Nino
 * does, ask her", their assistant asked Nino at once, and the owner's run then
 * asked the same helper to ask Nino himself. The helper was troubled twice
 * because the owner's side never heard the question had already gone on. The
 * onward person is not named here: who they are is in the helper's own words.
 */
export function passedOnNote(answers: readonly ArrivedAnswer[]): string {
  return passedOnLine(answers) + sharedNumberNote(answers);
}

/**
 * Tester 39832 (#1554): the helper sent a contact's number, it arrived — and
 * the asker's next reply offered an introduction to that same person. He
 * already has the number; the next step is his own call.
 */
export function sharedNumberNote(answers: readonly ArrivedAnswer[]): string {
  if (!answers.some((a) => a.answer.includes(ALLOW_OPEN))) return '';
  return (
    ' პასუხში ნომერია: მფლობელს ის უკვე აქვს და თავად დაუკავშირდება. ამ ადამიანთან გაცნობა ' +
    'აღარ შესთავაზო და მისი ნომერი აღარ მოითხოვო.'
  );
}

function passedOnLine(answers: readonly ArrivedAnswer[]): string {
  const who = answers
    .filter((a) => a.passedOn === true)
    .map((a) => a.fromName?.trim() || 'ადამიანმა, ვისაც კითხვა გაეგზავნა');
  if (who.length === 0) return '';
  return (
    ` ${who.join(', ')}: კითხვა უკვე გადასცა იმ ადამიანს, ვინც დაასახელა, და მისი პასუხი აქ ` +
    'მოვა. იგივე აღარ სთხოვო და მფლობელს უთხარი, რომ კითხვა უკვე გადაცემულია.'
  );
}

/**
 * ⚠️ ROW 322 — SIX ANSWERS IN EIGHT SECONDS, AND FIVE OF THEM WAITED UP TO
 * EIGHTEEN MINUTES.
 *
 * The seat's goal 11155, 30 September. Six recipients answered between
 * 06:39:25 and 06:39:33. The first answer's wake took the thread; the other
 * five live wakes found it busy and returned — and nothing retried them but
 * the five-minute sweep, which then relayed them ONE RUN EACH, 06:44 to 06:57.
 * Meanwhile the first run told the owner „nobody else has answered yet".
 *
 * So answers that are waiting together are delivered together: one event,
 * every answer in it with its own name and its own quoting rule, and the
 * instructions once.
 */
export function buildAnswersWakeEvent(answers: readonly ArrivedAnswer[]): string {
  if (answers.length === 1) {
    const only = answers[0];
    return buildAnswerWakeEvent(only.answer, only.fromName, only.verbatim) + passedOnNote(answers);
  }
  const blocks = answers
    .map((a) => {
      const who = a.fromName?.trim() || 'ადამიანი, ვისაც კითხვა გაეგზავნა';
      const how = a.verbatim
        ? 'მისი ზუსტი სიტყვები — ციტატად'
        : 'მისი ასისტენტის ჩამოყალიბება — აზრით, ბრჭყალების გარეშე';
      return `<answer from="${who}" (${how})>\n${a.answer}\n</answer>`;
    })
    .join('\n');
  return (
    `${answers.length} ადამიანმა გიპასუხა შენს გაგზავნილ კითხვებზე — ყველა პასუხი აქაა, ` +
    'თითოეული თავისი ტეგით:\n' +
    `${blocks}\n` +
    'მფლობელს ყველა გადაეცი ერთ პასუხში, თითოეულს დაასახელე ვინ უპასუხა; ციტატად მხოლოდ ის, ' +
    'რაც ზუსტი სიტყვებადაა მონიშნული, დანარჩენი აზრით. თუ სხვა ენაზეა, მფლობელის ენაზე ' +
    'გადმოეცი. არ თქვა, რომ დანარჩენებს ჯერ არ უპასუხიათ — აქ ყველა მოსული პასუხია. ' +
    `${AGREED_IS_NOT_CONNECTED} შემდეგ გააგრძელე დავალება.` +
    passedOnNote(answers)
  );
}

/**
 * ROW 322(a) — the event when the server has ALREADY put the answers on the
 * owner's screen (`answerCard.service`). The answers ride along so the run
 * knows them; what changes is the job: not to read them out again, but to say
 * what the owner should do next and take the next step. The wording of that
 * job is the seat's (901, Text A): one sentence, and never „has not answered"
 * about somebody whose answer is on the card.
 */
/** What the model reads where a shared number stood: the card above already shows it. */
const SHARED_NUMBER_ON_CARD = '[ნომერი ბარათზე ჩანს]';

export function buildShownAnswersWakeEvent(answers: readonly ArrivedAnswer[]): string {
  const blocks = answers
    .map((a) => {
      const who = a.fromName?.trim() || 'ადამიანი, ვისაც კითხვა გაეგზავნა';
      const answer = allowedSpansForTheModel(a.answer, SHARED_NUMBER_ON_CARD);
      return `<answer from="${who}">\n${answer}\n</answer>`;
    })
    .join('\n');
  return (
    `${answers.length === 1 ? 'მოვიდა პასუხი' : `მოვიდა ${answers.length} პასუხი`} შენს ` +
    'გაგზავნილ კითხვებზე:\n' +
    `${blocks}\n` +
    `სერვერმა ეს პასუხები ${ALREADY_ON_CARD} — ბარათად, შენი პასუხის ზემოთ, ვინ რა ` +
    'უპასუხა. პასუხის სიტყვები არ გაიმეორო: არ ჩამოთვალო, არ დააციტირო, არ გადმოსცე. თქვი ' +
    'მხოლოდ ის, რა უნდა გააკეთოს მფლობელმა შემდეგ — ერთი წინადადებით; თუ რომელიმე პასუხი ' +
    'კითხვაა, ეს წინადადება ისაა, რომ ადამიანი პასუხს ელოდება. არასდროს თქვა, რომ ვინმეს ' +
    `ჯერ არ უპასუხია, თუ მისი პასუხი ბარათზეა. ${AGREED_UNDER_CARD}${MEETING_UNDER_CARD} შემდეგ ` +
    'გააგრძელე დავალება.' +
    passedOnNote(answers)
  );
}

/** What an answer-wake run's final reply MUST contain, verbatim. */
export interface EnsureQuoted {
  readonly text: string;
  readonly who: string | null;
  /**
   * Row 303: whether `text` is the answerer's OWN words. When false, the reply
   * must carry the meaning and name who said it, and it must NOT put the text
   * in quotation marks — that would present their assistant's wording as
   * theirs.
   */
  readonly verbatim?: boolean;
}

/** How many of the recipient's own lines are read to find their words. */
const OWN_WORDS_LOOKBACK = 20;
const OWN_WORDS_NOISE_RE = /[^\p{L}\p{N}]+/gu;

/** How many recent lines are read to find the helper's own. */
const OWN_LINE_LOOKBACK = 6;
const MAX_OWN_LINE_CHARS = 1000;

/**
 * The helper's own last line in the ask thread, or '' when there is none to
 * hold the answer to. D648: it is no longer sent in place of the assistant's
 * wording (the #34 restore is gone); it is what the facts are checked against.
 */
async function helpersOwnLine(askThreadId: number): Promise<string> {
  const result = await query<{ role: string; content: string }>(
    `SELECT role, content FROM conversations
      WHERE thread_id = $1 AND kind = 'message' AND TRIM(content) <> ''
      ORDER BY created_at DESC LIMIT $2`,
    [askThreadId, OWN_LINE_LOOKBACK],
    ASK_QUERY_TIMEOUT_MS,
  );
  const own = result.rows.find((r) => r.role === 'user')?.content.trim() ?? '';
  return own.length > MAX_OWN_LINE_CHARS ? '' : own;
}

/**
 * D648: why the answer about to go may not go — facts of the helper's line it
 * lost, or a sentence of the helper's own wording it carries whole (the
 * tester's 1154, 38745). Null when it may go. A failed read checks nothing:
 * the answer goes as written, and the log says so.
 */
async function answerHeldBack(
  askThreadId: number,
  question: string,
  answerText: string,
): Promise<string | null> {
  try {
    const own = await helpersOwnLine(askThreadId);
    const missing = missingFacts(own, answerText);
    if (missing.length > 0) return missingFactsRefusal(missing);
    if (isDeclineChoice(own)) return null;
    if (sentenceCarriedOver(own, answerText) !== null) return HELPERS_SENTENCE_REFUSAL;
    const added = factsAdded(own, question, answerText);
    if (added.length > 0) return factsAddedRefusal(added);
    const endorsed = endorsementAdded(own, answerText);
    if (endorsed.length > 0 && heldBackOnce(heldBackForEndorsement, askThreadId)) {
      return endorsementAddedRefusal(endorsed);
    }
    return firstPersonHeldBack(askThreadId, firstPersonCarried(own, question, answerText));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[ask-answer] could not read the helper's own line:", (err as Error).message);
    return null;
  }
}

/**
 * Ask threads whose answer was already held back once for the helper's first
 * person. The „ვ" test is a heuristic — a noun can start with „ვ" — so it holds
 * an answer back once, and the next send goes, never leaving one stuck.
 */
const heldBackForFirstPerson = new Set<number>();

/** Ask threads held back once for added praise — a heuristic, so once only. */
const heldBackForEndorsement = new Set<number>();

/** True the first time for a thread (hold it back), false the next (let it go). */
function heldBackOnce(heldBack: Set<number>, askThreadId: number): boolean {
  if (heldBack.has(askThreadId)) {
    heldBack.delete(askThreadId);
    return false;
  }
  heldBack.add(askThreadId);
  return true;
}

function firstPersonHeldBack(askThreadId: number, carried: readonly string[]): string | null {
  if (carried.length === 0 || heldBackForFirstPerson.has(askThreadId)) {
    heldBackForFirstPerson.delete(askThreadId);
    return null;
  }
  heldBackForFirstPerson.add(askThreadId);
  return firstPersonRefusal(carried);
}

const HELPERS_SENTENCE_REFUSAL =
  "Not sent: the answer carries one of the helper's own sentences, whole or with words only " +
  'left out. D648: ' +
  'say what they said in your own words, as their assistant (they → „ასწავლის", not ' +
  '„ვასწავლი"), keep every fact exactly, and send again.';

function comparable(text: string): string {
  return text.toLowerCase().replace(OWN_WORDS_NOISE_RE, ' ').trim();
}

/**
 * ⚠️ ROW 303 — A REWORDED ANSWER ARRIVED IN QUOTATION MARKS, AS THE PERSON'S
 * OWN WORDS.
 *
 * The seat's round of 29 September: Test 44 typed „კი, ბახვა გამოგონილი კარგი
 * ბუღალტერია, ჩემი კონტაქტია. დავაკავშირებ, თუ გინდა." His assistant sent
 * „კი, ვიცნობ სანდო ბუღალტერს, ბახვა. დაგაკავშირებთ." — and the owner's event
 * said „pass it on word for word, as a quotation", so the owner read a
 * sentence Test 44 never wrote, in quotes, with his name on it.
 *
 * The server can answer the question the event was assuming: is this text in
 * what the person actually typed in that thread? If it is, it is theirs and
 * may be quoted. If it is not — their assistant tidied or reworded it — it is
 * their MEANING, and it goes on as meaning. Punctuation and case are ignored,
 * so a tidied comma does not cost a quote; different words do.
 *
 * Unknown is treated as not theirs: a quotation is a claim, and a claim the
 * server cannot check is not made.
 */
export async function answerIsTheirOwnWords(
  askThreadId: number | null,
  answer: string,
): Promise<boolean> {
  const wanted = comparable(answer);
  if (askThreadId === null || wanted === '') return false;
  try {
    const result = await query<{ content: string }>(
      `SELECT content FROM conversations
        WHERE thread_id = $1 AND role = 'user'
        ORDER BY created_at DESC
        LIMIT $2`,
      [askThreadId, OWN_WORDS_LOOKBACK],
      ASK_QUERY_TIMEOUT_MS,
    );
    return result.rows.some((r) => comparable(r.content ?? '').includes(wanted));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[ask-answer] could not read the recipient's own lines:", (err as Error).message);
    return false;
  }
}

const QUOTE_NORM_RE = /\s+/g;

/**
 * Server-side guarantee for the wake event's "გადაეცი სიტყვასიტყვით"
 * instruction: prompt-only enforcement failed live — the first N-01 protocol
 * round (21 Aug, thread 9835) delivered „ეს TBC-ის საბაზისო პირობებია" with
 * the actual answer nowhere in the thread. If the model's reply does not
 * contain the answer text, the quote is prepended — same philosophy as
 * wrapAllowedNumbers: the model is asked, the server makes it true.
 */
/** One answer's guarantee, or several when a wake carries a batch (row 322). */
export type QuoteGuarantee = EnsureQuoted | readonly EnsureQuoted[];

export function guaranteesOf(guarantee: QuoteGuarantee | undefined): readonly EnsureQuoted[] {
  if (guarantee === undefined) return [];
  return Array.isArray(guarantee) ? guarantee : [guarantee as EnsureQuoted];
}

/** Every answer in the wake reaches the reply — applied last-first so they read in order. */
export function ensureEveryQuote(reply: string, guarantee: QuoteGuarantee): string {
  return [...guaranteesOf(guarantee)]
    .reverse()
    .reduce((out, ensure) => ensureVerbatimQuote(out, ensure), reply);
}

export function ensureVerbatimQuote(reply: string, ensure: EnsureQuoted): string {
  const norm = (s: string): string => s.replace(QUOTE_NORM_RE, ' ').trim();
  const answer = ensure.text.trim();
  if (!answer) return reply;
  if (norm(reply).includes(norm(answer))) return reply;
  const who = ensure.who?.trim() ?? '';
  // Row 303: their assistant's wording is not theirs. The guarantee becomes
  // „the owner hears who answered" rather than „the text in quotes": a reply
  // that names them has relayed it, and one that does not gets the meaning
  // put in front of it — without quotation marks.
  if (ensure.verbatim === false) {
    if (who !== '' && reply.includes(who)) return reply;
    return `${who === '' ? answer : `${who}: ${answer}`}\n\n${reply}`;
  }
  const attribution = who !== '' ? ` — ${who}` : '';
  return `„${answer}"${attribution}\n\n${reply}`;
}

/**
 * Is this thread's task waiting on someone else right now? A thread whose ask
 * is unanswered is `waiting`, never `done` — ticket 4 item 0C.5: thread 8416
 * sat in the finished list while the founder was waiting on a reply.
 */
export async function hasPendingAskForThread(threadId: number): Promise<boolean> {
  const result = await query<{ id: number }>(
    `SELECT ta.id
     FROM task_asks ta
     JOIN tasks t ON t.id = ta.task_id
     WHERE t.thread_id = $1 AND ta.status = 'sent'
     LIMIT 1`,
    [threadId],
    ASK_QUERY_TIMEOUT_MS,
  );
  return result.rows.length > 0;
}

export interface UnwokenAnswer {
  id: number;
  task_id: number;
  answer: string | null;
  from_name: string | null;
  task_status: string | null;
  /** A goal opened through the connector has no thread — nothing to wake INTO. */
  task_thread_id: number | null;
  /** The recipient's own thread — where their own words can be checked (row 303). */
  ask_thread_id: number | null;
  /** Row 322(a): the goal's owner, whose thread the answers card goes into. */
  owner_user_id?: string | null;
  /** Row 322(a): the card carrying this answer was already written. */
  shown?: boolean;
  /** The tester's 1108 (33509): the answerer's assistant already asked someone else onward. */
  passed_on?: boolean;
}

/** Answered asks whose owning task was never woken — the sweep's worklist. */
export async function listUnwokenAnswers(limit: number): Promise<UnwokenAnswer[]> {
  const result = await query<UnwokenAnswer>(
    `SELECT ta.id, ta.task_id, ta.answer, ${ASKED_AS_THE_ASKER_SAVED_THEM} AS from_name, t.status AS task_status,
            t.thread_id AS task_thread_id, ta.ask_thread_id
     FROM task_asks ta
     LEFT JOIN tasks t ON t.id = ta.task_id
     WHERE ta.status = 'answered'
       AND ta.answered_at IS NOT NULL
       AND ta.wake_delivered_at IS NULL
     ORDER BY ta.answered_at ASC
     LIMIT $1`,
    [limit],
    ASK_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** One goal's answers still owed to its owner, oldest first (row 322). */
export async function listUnwokenAnswersForTask(
  taskId: number,
  limit: number,
): Promise<UnwokenAnswer[]> {
  const result = await query<UnwokenAnswer>(
    `SELECT ta.id, ta.task_id, ta.answer, ${ASKED_AS_THE_ASKER_SAVED_THEM} AS from_name, t.status AS task_status,
            t.thread_id AS task_thread_id, ta.ask_thread_id,
            t.user_id AS owner_user_id, ta.answer_shown_at IS NOT NULL AS shown,
            EXISTS (SELECT 1 FROM task_asks r WHERE r.parent_ask_id = ta.id) AS passed_on
     FROM task_asks ta
     LEFT JOIN tasks t ON t.id = ta.task_id
     WHERE ta.task_id = $1
       AND ta.status = 'answered'
       AND ta.answered_at IS NOT NULL
       AND ta.wake_delivered_at IS NULL
     ORDER BY ta.answered_at ASC
     LIMIT $2`,
    [taskId, limit],
    ASK_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

export async function markAskWakeDelivered(askId: number): Promise<void> {
  await query(
    `UPDATE task_asks SET wake_delivered_at = NOW() WHERE id = $1`,
    [askId],
    ASK_QUERY_TIMEOUT_MS,
  );
}

/** Everything this task has asked and heard back — for the prompt's task section. */
export async function getAsksForTask(taskId: number): Promise<TaskAsk[]> {
  const result = await query<TaskAsk>(
    `SELECT ta.id, ta.task_id, ta.to_user_id, ${ASKED_AS_THE_ASKER_SAVED_THEM} AS to_name, ta.status,
            ta.question, ta.answer, ta.created_at,
            ta.declined_at, ta.seen_at, ta.later_until, ta.expired_at
     FROM task_asks ta
     WHERE ta.task_id = $1
     ORDER BY ta.created_at ASC`,
    [taskId],
    ASK_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

export interface PendingAsk {
  ask_id: number;
  from_name: string | null;
  question: string;
  created_at: string;
  /**
   * The conversation this question lives in. Row 266: the app's answer to „is
   * anyone asking me something?" has to point at somewhere the person can
   * actually reply, and the reply belongs in the ask's own thread rather than
   * in whichever conversation they happened to ask the question from. Null
   * for an ask whose thread was never created.
   */
  ask_thread_id: number | null;
}

/**
 * Real questions relayed by another member, still unanswered — a completely
 * different table from introduction_requests (the mediator "who wants to
 * meet whom" flow), and one check_my_inbox never queried. Live-caught (25
 * Aug): two live asks (ids 892, 925) sat on the founder's own inbox sidebar
 * and in /admin/asks, both status 'sent', while the connector's
 * check_my_inbox reported `waiting_for_me: []` twice, an hour apart, in the
 * same run.
 */
export async function getPendingAsksForUser(userId: string): Promise<PendingAsk[]> {
  const result = await query<PendingAsk>(
    `SELECT ta.id AS ask_id, ${ASKER_AS_THE_READER_SAVED_THEM} AS from_name, ta.question, ta.created_at,
            ta.ask_thread_id
     FROM task_asks ta
     WHERE ta.to_user_id = $1::int AND ta.status = 'sent'
     ORDER BY ta.created_at ASC`,
    [userId],
    ASK_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** Stop everything in flight when a task closes; tell the recipients honestly. */
/**
 * Returns HOW MANY people were told, which is not decoration: the owner's stop
 * line (row 113) names it, and „I stopped the goal" reads very differently to
 * someone who has three questions out on their behalf than to someone who has
 * none.
 */
export async function cancelAsksForTask(taskId: number): Promise<number> {
  const cancelled = await query<{ ask_thread_id: number | null; to_user_id: number }>(
    `UPDATE task_asks SET status = 'cancelled'
     WHERE task_id = $1 AND status = 'sent'
     RETURNING ask_thread_id, to_user_id`,
    [taskId],
    ASK_QUERY_TIMEOUT_MS,
  );
  /**
   * Row 148 — one note per PERSON, not one per ask.
   *
   * The seat filed it on 17 September: somebody got the same „no longer
   * needed" note TWICE, in the same second. It was never checked and it has
   * happened twice more since, most recently TODAY:
   *
   *   thread 14885   16 Sep 16:38:53   0.328 s apart
   *   thread 15512   17 Sep 18:37:17   0.317 s apart   <- the seat's case
   *   thread 20098   21 Sep 13:19:23   0.440 s apart
   *
   * All three are the same shape and the cause is one line: a relayed
   * conversation CONTINUES IN ONE THREAD — „later messages land in the same
   * thread on their phone" is ask_contact's own promise — so a goal with two
   * sent asks to one person has two rows pointing at one thread, and the loop
   * wrote a note for each row. Two of the three were an ask plus its follow-up
   * and the third was two ordinary asks, so „skip follow-ups" would have fixed
   * two cases out of three and looked right.
   *
   * THE COUNT THE OWNER SEES DOES NOT CHANGE. They sent two questions and two
   * were cancelled; that line stays 2. It is the RECIPIENT who is told once,
   * because two identical apologies in the same second read as a fault in the
   * product rather than as courtesy.
   */
  const told = new Set<number>();
  for (const row of cancelled.rows) {
    if (row.ask_thread_id === null || told.has(row.ask_thread_id)) continue;
    told.add(row.ask_thread_id);
    // In the RECIPIENT's language: this is the message that closes a
    // stranger's loop - they were asked for a favour and are being let off,
    // and being let off in a script they cannot read is worse than silence.
    // THEIR LANGUAGE IN THIS THREAD, for the reason set out at
    // `withdrawAsksToOptedOutPerson`: if they have answered here, that is the
    // best evidence there is, and `threadLanguage` falls back to exactly the
    // account-wide reading this line used to do when they have not.
    const language = await threadLanguage(row.ask_thread_id).catch(() => 'ka' as RunLanguage);
    await saveThreadMessage(
      row.ask_thread_id,
      row.to_user_id,
      'assistant',
      askCancelledNote(language),
    ).catch(() => undefined);
    /**
     * Row 233 — the note went in and the thread went on saying „Needs your
     * answer". The seat read two of two from the 12:59 stop, still needs_you
     * at 14:48: „this question is no longer needed" sitting under a header
     * asking for an answer, which is a contradiction the reader has to resolve
     * themselves, and they will resolve it the wrong way.
     *
     * `done` rather than `waiting`: nothing is expected of them any more.
     */
    await setThreadStatus(String(row.to_user_id), row.ask_thread_id, 'done', {
      isTask: true,
    }).catch(() => undefined);
  }
  await thankThePeopleWhoAnswered(taskId).catch((err: unknown) =>
    // eslint-disable-next-line no-console
    console.error(
      `[ask-close] could not thank the answerers of ${taskId}:`,
      (err as Error).message,
    ),
  );
  return cancelled.rowCount ?? cancelled.rows.length;
}

/**
 * Row 233's other half — the person who ANSWERED is told the goal is closed.
 *
 * The seat's reading, 22 September, of one goal closed at 10:32:58:
 *
 *   10:32:57  Netai Test 7, who NEVER ANSWERED, got „this question is no
 *             longer needed, no reply necessary. Thank you!" and went to done
 *   10:32:19  Netai Test 9, who DID answer, last heard anything at the moment
 *             he sent it. Nothing at the finish. Nothing since.
 *
 * „The person who ignored the question is thanked, and the person who actually
 * helped is not." Their sentence, and the right way to put it.
 *
 * IT RUNS INSIDE `cancelAsksForTask`, which is not where it obviously belongs
 * and IS where it has to be: that function is what every close already calls,
 * on the finish and on the stop, from five separate call sites. A sixth caller
 * that remembered to cancel and forgot to thank is precisely the shape of this
 * whole row — the badge close lived in one branch of two and the typed answer
 * never got one.
 *
 * ONE LINE, NOT THE TWO THEY WROTE, and the missing half is said out loud in
 * `askAnsweredAndGoalClosed`: nothing records whose answer settled it.
 *
 * Their thread is already `done` — `deliverCapturedAnswer` closed it when they
 * answered — so this adds the sentence and leaves the state alone.
 */
async function thankThePeopleWhoAnswered(taskId: number): Promise<void> {
  const answered = await query<{
    ask_thread_id: number | null;
    to_user_id: number;
    asker_name: string | null;
  }>(
    `SELECT ta.ask_thread_id, ta.to_user_id,
            ${ASKER_AS_THE_READER_SAVED_THEM} AS asker_name
       FROM task_asks ta
      WHERE ta.task_id = $1 AND ta.status = 'answered'`,
    [taskId],
    ASK_QUERY_TIMEOUT_MS,
  );

  /**
   * One thank-you per PERSON's thread, not per ask — row 148's rule, and a
   * relayed conversation deliberately continues in one thread, so a goal that
   * asked somebody twice has two rows pointing at one chat.
   *
   * AND NOT ONCE PER CLOSE EITHER, which the first version of this got wrong.
   * `cancelAsksForTask` runs from FIVE call sites and its own UPDATE is
   * idempotent — it only touches rows still `sent`. This read is not: an
   * ANSWERED row stays answered for ever, so a goal closed twice thanked the
   * same person twice. `finish_task` followed by `update_task(status=closed)`
   * is an ordinary pair, and the thread delete is a third door.
   *
   * The same test the engine uses for „has this person already been told
   * THIS": the exact line against their last assistant message. A status flag
   * could only answer „has this thread been told anything".
   */
  const told = new Set<number>();
  for (const row of answered.rows) {
    if (row.ask_thread_id === null || told.has(row.ask_thread_id)) continue;
    const asker = row.asker_name?.trim();
    if (asker === undefined || asker === '') continue;
    told.add(row.ask_thread_id);
    // THEIR language. They are a stranger doing somebody a favour, and being
    // thanked in a script they cannot read is worse than not being thanked.
    // Read from this thread first — they have by definition just written in
    // it, since this line only goes out because they answered.
    const language = await threadLanguage(row.ask_thread_id).catch(() => 'ka' as RunLanguage);
    const line = askAnsweredAndGoalClosed(language, asker);
    if (await lastAssistantMessageIs(row.ask_thread_id, line).catch(() => false)) continue;
    await saveThreadMessage(row.ask_thread_id, row.to_user_id, 'assistant', line).catch(
      () => undefined,
    );
  }
}

/**
 * A person switched questions off, so every question already on its way to
 * them dies — AND THE PEOPLE WHO ASKED THEM ARE TOLD.
 *
 * The seat asked whether the asker is ever told and would not report it until
 * one of us knew. Read from the live table: ask 3665 went to `cancelled` at
 * 09:27:40 on 22 September, and account 171937's held updates that morning are
 * two debriefs and two search follow-ups — none of them about it. The 3-day
 * debrief for that ask would have said „no answer for 3 days … keep waiting",
 * which is false about a withdrawn question, and it is correctly dropped at
 * release time by `debriefStillDue`. So the answer was: silence, correctly,
 * and permanently. His goal waits on a question that can never come back.
 *
 * THE CANCELLING ITSELF WAS ALREADY RIGHT and is deliberately silent towards
 * the RECIPIENT — they have just asked for no more messages, and a
 * cancellation notice is a message. This adds nothing on that side. It is the
 * other side, the person who asked, who was never told anything.
 *
 * AND IT SAYS NOTHING ABOUT WHY. The other person's refusal is theirs; a line
 * explaining it would publish one person's choice to another. He is told his
 * question is gone and offered the only thing he can act on.
 *
 * Best-effort throughout, and the opt-out is recorded before any of this runs:
 * a person must never fail to be left alone because a thread could not be
 * written to.
 */
export async function withdrawAsksToOptedOutPerson(optedOutUserId: string): Promise<number> {
  const cancelled = await query<{
    task_id: number;
    from_user_id: number;
    thread_id: number | null;
    to_name: string | null;
  }>(
    `UPDATE task_asks ta SET status = 'cancelled'
      WHERE ta.to_user_id = $1::int AND ta.status = 'sent'
      RETURNING ta.task_id, ta.from_user_id,
                (SELECT t.thread_id FROM tasks t WHERE t.id = ta.task_id) AS thread_id,
                ${ASKED_AS_THE_ASKER_SAVED_THEM} AS to_name`,
    [optedOutUserId],
    ASK_QUERY_TIMEOUT_MS,
  );

  /**
   * One line per GOAL, not per ask. A goal that wrote to this person twice
   * (ticket 9 task 12 makes that ordinary) has two rows here, and two
   * identical withdrawals in the same second read as a fault in the product
   * rather than as courtesy — which is row 148's lesson, in a third place.
   */
  const told = new Set<number>();
  for (const row of cancelled.rows) {
    if (row.thread_id === null || told.has(row.thread_id)) continue;
    told.add(row.thread_id);
    /**
     * THE CHAT'S LANGUAGE, NOT THE ACCOUNT'S — and that distinction is the
     * whole of the seat's blemish 1, 22 September.
     *
     * Thread 22280, 18:39:52, an English conversation: „Netai Test 3-ისთვის
     * გაგზავნილი შენი კითხვა გავაუქმე, პასუხი აღარ მოვა."
     *
     * `userLanguage` was not wrong about the person — it reads their last
     * eight messages ANYWHERE, and this owner does write Georgian, in other
     * threads. It was answering a different question from the one that
     * matters. The line lands in one conversation, and that conversation has
     * a language of its own.
     *
     * `threadLanguage` is the same reading done in the right order: this
     * thread's own words first, the account's everywhere-language when the
     * thread has none yet, Georgian only for somebody who has never written
     * anything. Nothing is lost for an empty thread, which is the case
     * `userLanguage` was picked for.
     */
    const language = await threadLanguage(row.thread_id).catch(() => 'ka' as RunLanguage);
    const who = row.to_name?.trim();
    if (who === undefined || who === '') continue;
    await saveThreadMessage(
      row.thread_id,
      row.from_user_id,
      'assistant',
      askWithdrawnAfterOptOut(language, who),
    ).catch(() => undefined);
  }
  return cancelled.rowCount ?? cancelled.rows.length;
}

export interface IncomingAsk {
  id: number;
  task_id: number;
  question: string;
  from_name: string | null;
  status: string;
}

/**
 * The account a new ask's chain started from (Ticket 10 Task 25 (a), D123).
 * A direct ask starts with its sender; a relay inherits its parent's origin,
 * falling back to the parent's sender for rows older than migration 124.
 */
async function chainOriginFor(
  fromUserId: string,
  parentAskId: number | undefined,
): Promise<number> {
  if (parentAskId === undefined) return Number(fromUserId);
  const parent = await query<{ origin_user_id: number | null; from_user_id: number }>(
    `SELECT origin_user_id, from_user_id FROM task_asks WHERE id = $1 LIMIT 1`,
    [parentAskId],
    ASK_QUERY_TIMEOUT_MS,
  );
  const row = parent.rows[0];
  if (!row) return Number(fromUserId);
  return row.origin_user_id ?? row.from_user_id;
}

/**
 * Who pays for a run on this thread (Ticket 10 Task 25 (a), D123, D133): the
 * person who ASKED for it. A helper pays nothing.
 *
 * Ticket 20 row 150. This covered incoming_ask and nothing else, and the other
 * two helper threads were quietly charging the helper. Read from the live
 * ledger over fourteen days, the charged account is the thread's own owner on
 * every one of them:
 *
 *   incoming_ask      $3.84   the chain origin pays — correct since D123
 *   campaign_invite   $0.23   the person being asked to invite somebody pays
 *   incoming_request  $0.08   the mediator pays for a stranger's request
 *
 * Small money and a plain rule broken, which is the kind that stops being
 * small the moment anyone uses the product.
 *
 * A CAMPAIGN INVITE HAS NO REQUESTER AT ALL. invite_campaigns carries no owner
 * column: the platform starts those, and the person in the thread is being
 * asked to invite one of their contacts. So nobody pays, and that is why this
 * returns null rather than picking somebody. „Nobody asked for this" and „the
 * lookup failed" must not come out as the same answer.
 *
 * On a LOOKUP FAILURE the user pays, unchanged: a missing row must not be able
 * to make runs free, which is the direction that costs the company silently.
 */
export async function runPayerFor(
  userId: string,
  threadId: number,
  threadType: string | null | undefined,
): Promise<string | null> {
  if (threadType === 'incoming_ask') {
    const result = await query<{ origin_user_id: number | null }>(
      `SELECT origin_user_id FROM task_asks WHERE ask_thread_id = $1 ORDER BY id DESC LIMIT 1`,
      [threadId],
      ASK_QUERY_TIMEOUT_MS,
    );
    const origin = result.rows[0]?.origin_user_id;
    return origin === null || origin === undefined ? userId : String(origin);
  }
  if (threadType === 'incoming_request') {
    const result = await query<{ requester_user_id: number | null }>(
      `SELECT ir.requester_user_id
         FROM threads t
         JOIN introduction_requests ir ON ir.id = t.introduction_request_id
        WHERE t.id = $1 LIMIT 1`,
      [threadId],
      ASK_QUERY_TIMEOUT_MS,
    );
    const requester = result.rows[0]?.requester_user_id;
    return requester === null || requester === undefined ? userId : String(requester);
  }
  // A CAMPAIGN INVITE IS THE USER'S COST — Tornike's word, 16 September,
  // overruling what I built an hour earlier.
  //
  // I had made it free on the reasoning that invite_campaigns has no owner
  // column, so nobody asked for the conversation. He read it the other way and
  // the argument is better than mine: in that thread the assistant suggests to
  // its OWN user a person worth inviting and explains how that person grows
  // that user's network. The value is theirs, so the small cost is theirs. The
  // invite itself then goes out from them outside Netai (D122).
  //
  // The null branch is gone rather than left unreachable: the return type
  // still allows it, because the two call sites now handle „nobody pays"
  // correctly and that is worth keeping for whatever needs it next.
  return userId;
}

/** The live ask behind an incoming_ask thread — injected into the recipient's prompt. */
/**
 * #1684 (A1): the reader opened the conversation an ask lives in, so the
 * asker's goal can say „has seen it" instead of „no answer". Only the reader's
 * own opening counts, and only the first.
 */
export async function markAsksSeen(askThreadId: number, readerUserId: string): Promise<number> {
  const result = await query(
    `UPDATE task_asks SET seen_at = NOW()
      WHERE ask_thread_id = $1 AND to_user_id = $2::int AND status = 'sent' AND seen_at IS NULL`,
    [askThreadId, readerUserId],
    ASK_QUERY_TIMEOUT_MS,
  );
  return result.rowCount ?? 0;
}

export async function getAskByThread(askThreadId: number): Promise<IncomingAsk | null> {
  const result = await query<IncomingAsk>(
    `SELECT ta.id, ta.task_id, ta.question, ta.status, ${ASKER_AS_THE_READER_SAVED_THEM} AS from_name
     FROM task_asks ta
     WHERE ta.ask_thread_id = $1
     ORDER BY ta.id DESC LIMIT 1`,
    [askThreadId],
    ASK_QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

/**
 * THE fix for ticket 4 items 0A/0AA was: a relay failure is NOT an answer
 * failure. On 11 Aug the recipient was told „ამის გადაცემა ვერ მოხერხდა" four
 * times while the asker had her answer every time — she was being shown the
 * result of the contact lookup, not of the delivery. That distinction is right
 * and it stays.
 *
 * THE SENTENCE THAT CARRIED IT WAS TRUE THEN AND IS NOT TRUE NOW, and it cost
 * an introduction on 19 September. It said the recipient's own reply „is
 * already with the asker — a separate, automatic path that always works".
 * There WAS such a path: the recipient's first raw message was auto-captured
 * as the answer. D48 removed it. `sendApprovedAskAnswer`'s own comment says so
 * in this file — „this is now the ONLY path an answer takes to the asker".
 *
 * So the server was telling the model, in a tool result, that the one thing it
 * still had to do was already done. Goal 6205: Test 2 said „yes, happy to
 * introduce them", `relay_ask` reached Test 3 at 18:51:07, and ask 2609 is
 * still `status = 'sent'` with `answered_at` NULL. No answer, no wake, and the
 * owner who paid for the chain was never told his introduction had been
 * accepted. A tool result is read as a rule — this file says that about
 * `send_answer_to_asker` twenty lines away.
 *
 * What replaces it says the same USEFUL thing (the relay and the answer are
 * two different things, and a relay's outcome says nothing about the answer)
 * without the false half, and names the call that is still owed.
 */
const RELAY_IS_NOT_THE_ANSWER =
  ' მნიშვნელოვანი: გადაგზავნა და მომხმარებლის საკუთარი პასუხი ორი სხვადასხვა რამაა, და ' +
  'გადაგზავნის შედეგი პასუხზე არაფერს ამბობს. პასუხი კითხვის ავტორთან მხოლოდ მაშინ მიდის, ' +
  'როცა შენ send_answer_to_asker-ს გამოიძახებ დამტკიცებული ტექსტით — ავტომატურად არაფერი ' +
  'გადადის. თუ ეს ჯერ არ გაგიკეთებია, ახლა გააკეთე. და არასოდეს უთხრა მომხმარებელს, რომ მისი ' +
  'პასუხი დაიკარგა — არაფერი დაკარგულა.';
// Appended to every FAILED relay outcome: the model on the recipient's side of
// an ask must close neutrally — a refusal must never surface as "system error"
// and must never end with "contact them directly" (ticket 3 §1, code-enforced
// because two prompt rewrites failed to hold it).
const RELAY_NEUTRAL_CLOSE =
  ' დამატებითი გადაგზავნა ვერ მოხერხდა — მომხმარებელს ეს ერთი მშვიდი წინადადებით უთხარი. ' +
  '„სისტემური შეცდომა" არ ახსენო და ' +
  'არასოდეს ურჩიო კითხვის ავტორთან ან სხვასთან პირდაპირ დაკავშირება.' +
  RELAY_IS_NOT_THE_ANSWER;

// A dictated number is used as-is; anything shorter is treated as a name.
const RELAY_PHONE_MIN_DIGITS = 9;
// We only need to distinguish "exactly one" from "several" — never a list.
const RELAY_NAME_MATCH_LIMIT = 3;

// Resolution errors carry their own instructions (including an explicit out
// when the user never asked to forward — ticket 4 blocker 2: relay_ask fired
// on "მაგას თვითონ ვკითხავ" with contact_name "თვითონ", and the neutral-close
// made the refusal read as a malfunction). They must NOT get the neutral-close
// suffix, which is for real send failures only.
const RELAY_EMPTY_NAME_ERROR =
  'კონტაქტის სახელი ცარიელია — გადაგზავნა არ მომხდარა და არც იყო საჭირო.' + RELAY_IS_NOT_THE_ANSWER;
// Ticket 4 item 0C.1b: naming a person IS the answer — a recommendation, not a
// relay request. A failed lookup must end in a thank-you, never in an apology
// and never in "spell it for me": no recipient will work out which script
// their own phonebook uses.
//
// This said the name „already reached the asker through the automatic
// capture", which is the same removed path as above — D48 took it away, so the
// name reaches the asker only inside the answer the model still has to send.
const RELAY_NOT_FOUND_ERROR =
  'ეს სახელი მომხმარებლის კონტაქტებში ვერ მოიძებნა, ამიტომ მისთვის ცალკე კითხვა არ გაგზავნილა. ' +
  'ეს არ არის პრობლემა: სახელი თავად რეკომენდაციაა და კითხვის ავტორს ისედაც მიუვა შენს ' +
  'გასაგზავნ პასუხში. მადლობა უთხარი და დაასრულე. ორთოგრაფია არ ჰკითხო, ვარაუდები ნუ ჩამოთვლი ' +
  'და ბოდიში არ მოიხადო.' +
  RELAY_IS_NOT_THE_ANSWER;
const RELAY_AMBIGUOUS_ERROR =
  'ამ სახელს რამდენიმე კონტაქტი ემთხვევა, ამიტომ ცალკე კითხვა არავის გაგზავნია. თუ მომხმარებელმა ' +
  'გადაგზავნა ნამდვილად ითხოვა, ჰკითხე სრული სახელი და გვარი; თუ უბრალოდ ადამიანს ასახელებდა — ' +
  'მადლობა უთხარი და დაასრულე. კანდიდატები ნუ ჩამოთვლი.' +
  RELAY_IS_NOT_THE_ANSWER;
/**
 * Ticket 20, the tester's row 125 — the sentence that made an assistant tell a
 * real user something untrue.
 *
 * 16 September, goal 3540. Ninia asked to reach Misho; ask 1849 went to
 * Tornike as the bridge. At 12:08:36 relay_ask was called from NINIA's own
 * thread with ask_id 1849 — an ask addressed to Tornike, not to her. The guard
 * was right to refuse it: only an ask's recipient may forward it.
 *
 * What it SAID was „Ask not found.", and the ask was found — it simply was not
 * hers. Her assistant read that as the person being unreachable and told her,
 * at 12:11:13, that writing to Misho is impossible. It is not.
 *
 * Two different facts had one sentence between them. They now have two, and
 * the one for the wrong caller says what is actually true, including the part
 * the model got wrong: this says nothing about whether the person can be
 * reached.
 */
const RELAY_NOT_YOUR_ASK_ERROR =
  'ეს კითხვა სხვას მიუვიდა — გადაგზავნა მხოლოდ მისმა ადრესატმა შეიძლება. ეს იმას კი არ ნიშნავს, ' +
  'რომ ამ ადამიანთან მიწვდომა შეუძლებელია: მხოლოდ იმას, რომ ამ კონკრეტული კითხვის გადაგზავნა ' +
  'ამ საუბრიდან არ ხდება. მომხმარებელს არ უთხრა, რომ ადამიანთან მიწერა შეუძლებელია, და ' +
  '„სისტემური შეცდომა" არ ახსენო.';

const RELAY_RESOLUTION_ERRORS: ReadonlySet<string> = new Set([
  RELAY_EMPTY_NAME_ERROR,
  RELAY_NOT_FOUND_ERROR,
  RELAY_AMBIGUOUS_ERROR,
  // Carries its own instruction, and the neutral close — „your answer reached
  // the asker" — would be a second false statement: nothing was answered here.
  RELAY_NOT_YOUR_ASK_ERROR,
]);

/**
 * Resolve the relay target INSIDE the server, from the relayer's own saved
 * contacts. The incoming_ask context has no search tools by design (ticket 3
 * §1) — candidate names, counts and tags must never enter that context window,
 * so ambiguity comes back as "ask the user for the full name", never as a list.
 */
async function resolveRelayContact(
  relayerUserId: string,
  contact: string,
): Promise<{ phone: string } | { error: string }> {
  const digits = contact.replace(/\D/g, '');
  if (digits.length >= RELAY_PHONE_MIN_DIGITS) return { phone: digits };
  // Same matching standard as search_contacts (ticket 4 item 0C.1): one variant
  // group per word — transliteration and drift folds included — so a name said
  // in Georgian resolves a contact saved in Latin script. The plain lowercase
  // comparison this replaces told a recipient her own saved contact did not
  // exist and asked her to guess the spelling of her own phonebook.
  // (findContactPhonesByName returns [] for an empty query too, same as the
  // inline check this replaced.)
  const matches = await findContactPhonesByName(relayerUserId, contact, RELAY_NAME_MATCH_LIMIT);
  if (matches.length === 0) {
    return { error: contact.trim() === '' ? RELAY_EMPTY_NAME_ERROR : RELAY_NOT_FOUND_ERROR };
  }
  if (matches.length > 1) {
    return { error: RELAY_AMBIGUOUS_ERROR };
  }
  return { phone: matches[0] };
}

/**
 * Relay: the RECIPIENT of an ask forwards it (with their consent, voiced in
 * their own thread) to one of THEIR contacts, named in their words — the
 * server finds the contact. The child ask keeps the original task_id, so C's
 * answer wakes A's task through the normal capture path; B is the sender for
 * caps and dedupe purposes. One level deep by design.
 */
export async function createRelayAsk(
  relayerUserId: string,
  parentAskId: number,
  contact: string,
  question?: string,
): Promise<CreateAskOutcome> {
  const outcome = await relayAskInner(relayerUserId, parentAskId, contact, question);
  /**
   * The SUCCESS case carries the reminder too, and it is the case that lost
   * goal 6205's introduction.
   *
   * Every one of the four warnings below it was on a FAILURE path, so the run
   * that relayed successfully was told nothing at all — it forwarded the
   * question, considered the job done, and left the parent ask unanswered and
   * the owner uninformed. A relay that works is exactly when it is easiest to
   * believe the exchange is finished, and it is the moment the bridge's „yes"
   * is worth the most to the person waiting for it.
   *
   * Only while the parent is genuinely still unanswered: a model that has
   * already sent the answer must not be told to send it again.
   */
  if (outcome.sent) {
    const unanswered = await parentStillUnanswered(parentAskId);
    return unanswered ? { ...outcome, note: RELAY_IS_NOT_THE_ANSWER.trim() } : outcome;
  }
  if (RELAY_RESOLUTION_ERRORS.has(outcome.error)) return outcome;
  return { sent: false, error: outcome.error + RELAY_NEUTRAL_CLOSE };
}

/** Whether the ask a relay came out of is still waiting for its own answer. */
async function parentStillUnanswered(parentAskId: number): Promise<boolean> {
  const result = await query<{ answered_at: string | null }>(
    `SELECT answered_at FROM task_asks WHERE id = $1 LIMIT 1`,
    [parentAskId],
    ASK_QUERY_TIMEOUT_MS,
  ).catch(() => null);
  const row = result?.rows[0];
  // A read that fails says the reminder, rather than swallowing it: being told
  // twice to send an answer costs a sentence, and not being told costs the
  // introduction.
  return row === undefined || row.answered_at === null;
}

async function relayAskInner(
  relayerUserId: string,
  parentAskId: number,
  contact: string,
  question?: string,
): Promise<CreateAskOutcome> {
  // The same rule as every other id from a model: `Number(input['ask_id'])` is
  // `NaN` when the field is missing, `pg` sends that as the string „NaN", and
  // Postgres raises rather than returning no rows. „Ask not found." is the
  // answer this function already has for an id that matches nothing.
  if (!Number.isInteger(parentAskId) || parentAskId <= 0) {
    return { sent: false, error: 'Ask not found.' };
  }
  const parent = await query<{
    id: number;
    task_id: number;
    to_user_id: number;
    question: string;
    parent_ask_id: number | null;
  }>(
    `SELECT id, task_id, to_user_id, question, parent_ask_id FROM task_asks WHERE id = $1 LIMIT 1`,
    [parentAskId],
    ASK_QUERY_TIMEOUT_MS,
  );
  const row = parent.rows[0];
  // Two facts, two sentences — see RELAY_NOT_YOUR_ASK_ERROR. „Not found" is
  // true only when there is genuinely no such ask.
  if (!row) return { sent: false, error: 'Ask not found.' };
  if (String(row.to_user_id) !== relayerUserId) {
    return { sent: false, error: RELAY_NOT_YOUR_ASK_ERROR };
  }
  if (row.parent_ask_id !== null) {
    return { sent: false, error: 'ეს კითხვა უკვე გადაგზავნილია ერთხელ — ჯაჭვი აქ ჩერდება.' };
  }
  // Ticket 19 G10, the founder's ruling of 15 September: the words the named
  // person reads are written by the BRIDGE's assistant, naming who is asking
  // and why.
  //
  // This used to fall back to `row.question` — the PARENT's wording, written
  // TO the bridge by somebody the named person has never heard of. Eke would
  // have received Tornike's name wrapped around Ninia's question to Tornike,
  // with no Ninia in it and no reason for the request.
  //
  // Refused rather than defaulted: the tool description now says the words are
  // required, and a description is a request, not a guard. The error says what
  // to write so the next call carries it.
  const relayed = question?.trim() ?? '';
  if (relayed === '') {
    return {
      sent: false,
      error:
        'Write the question as the named person will read it and pass it in `question`: who is ' +
        'asking, and why. They do not know the person behind it, and the original wording was ' +
        'written to YOU, not to them.',
    };
  }
  const target = await resolveRelayContact(relayerUserId, contact);
  if ('error' in target) {
    return { sent: false, error: target.error };
  }
  return createAsk(relayerUserId, row.task_id, target.phone, relayed, row.id);
}

/**
 * Row 205 — how long after an unanswered ask a second one to the same person
 * on the same goal is a duplicate rather than a nudge.
 *
 * Every observed pair was inside forty-one seconds. This is longer than any
 * run this service allows (the hard timeout is minutes) and far shorter than a
 * person deciding to follow somebody up.
 */
const DUPLICATE_ASK_WINDOW_SECONDS = 600;

// One polite reminder per unanswered ask, after this long.
const ASK_REMINDER_AFTER_HOURS = 48;

/**
 * WHEN A REMINDER GOES — Giorgi's decision G-002, Misho's word on 2 October.
 *
 * Until then reminders kept Tbilisi's waking hours (D472, 08:00–22:00), on
 * Tbilisi's clock, because a reminder used to ring a phone the moment it was
 * written: eleven real people had had one on a lock screen at night, three at
 * five in the morning. The ringing is now held by push quiet hours instead
 * (pushQuietHours.ts: 23:00–09:30 on each device's own clock), so the message
 * itself may land in the app at any hour, as every other message does, and
 * the phone rings at 09:30 the recipient's time.
 */
/**
 * The tester's 1008: a reader with several open questions got several
 * identical reminders at the same second, one per thread, none saying which
 * question it was. The line names who is asking; without a name it is the
 * line it always was.
 */
/**
 * #1420 (Giorgi, 5 Oct): the app said „your friend's ASSISTANT is asking you"
 * and the push for the same ask said „<friend> is asking you". The question is
 * the assistant's wording (D648), so the lock screen says so too, in the
 * recipient's language.
 */
export function askPushTitle(language: RunLanguage, senderName: string): string {
  switch (language) {
    case 'en':
      return `Netai — ${senderName}'s assistant is asking you`;
    case 'ru':
      return `Netai — ассистент ${senderName} спрашивает тебя`;
    case 'es':
      return `Netai — el asistente de ${senderName} te pregunta`;
    default:
      return `Netai — ${geoName(senderName, 'gen')} ასისტენტი გეკითხება`;
  }
}

export function askReminderLine(language: RunLanguage, askerName: string | null): string {
  if (!askerName) return RUN_STRINGS[language].askReminder;
  switch (language) {
    case 'en':
      return `A reminder: ${askerName}'s question is still unanswered — if you have a minute, your answer would really help. If you do not know, tell me that too and I will stop bothering you.`;
    case 'ru':
      return `Напоминание: вопрос от ${askerName} всё ещё без ответа — если есть минута, твой ответ очень поможет. Если не знаешь, напиши и это, и я больше не буду беспокоить.`;
    case 'es':
      return `Un recordatorio: la pregunta de ${askerName} sigue sin respuesta — si tienes un minuto, tu respuesta ayudaría mucho. Si no lo sabes, dímelo también y no te molestaré más.`;
    default:
      return `შეხსენება: ${geoName(askerName, 'gen')} კითხვა ჯერ უპასუხოა — თუ ერთი წუთი გაქვს, პასუხი ძალიან გამოადგება. თუ არ იცი, ისიც მომწერე და აღარ შეგაწუხებ.`;
  }
}

export async function sendDueAskReminders(limit: number): Promise<number> {
  const due = await query<{
    ask_thread_id: number | null;
    to_user_id: number;
    asker_name: string | null;
  }>(
    `UPDATE task_asks SET reminded_at = NOW()
     WHERE id IN (
       SELECT id FROM task_asks
       WHERE status = 'sent' AND reminded_at IS NULL
         -- ROW 300, then #1684 (A1/A3): a „later" tap holds the one reminder
         -- until the date the later named (three days when it named none);
         -- an ask nobody tapped keeps its 48 hours from the question.
         AND expired_at IS NULL
         AND ((later_at IS NULL
               AND created_at < NOW() - INTERVAL '${ASK_REMINDER_AFTER_HOURS} hours')
           -- a tap from before migration 207 has no later_until: its old
           -- 24 hours stand.
           OR (later_at IS NOT NULL
               AND COALESCE(later_until, later_at + INTERVAL '1 day') <= NOW()))
       ORDER BY created_at
       LIMIT $1
     )
     RETURNING ask_thread_id, to_user_id,
               ${nameAsSavedBySql('task_asks.to_user_id', 'task_asks.from_user_id')} AS asker_name`,
    [limit],
    ASK_QUERY_TIMEOUT_MS,
  );
  for (const row of due.rows) {
    if (row.ask_thread_id === null) continue;
    // The RECIPIENT's language. They are often a stranger, the wrapper above
    // this has spoken to them in it since 19 September, and the push below is
    // all they see on a lock screen.
    const language = await userLanguage(String(row.to_user_id)).catch(() => 'ka' as RunLanguage);
    await saveThreadMessage(
      row.ask_thread_id,
      row.to_user_id,
      'assistant',
      askReminderLine(language, row.asker_name),
    ).catch(() => undefined);
    void sendPushNotification(String(row.to_user_id), {
      ...RUN_STRINGS[language].askReminderPush,
      url: `/chat/${row.ask_thread_id}`,
    }).catch(() => undefined);
  }
  return due.rows.length;
}

/**
 * ROW 259 — has the owner typed anything into this goal since that ask went?
 *
 * `role = 'user'` is not enough on its own: the engine writes its own wake and
 * outcome lines under that role with `kind = 'event'`, and a button press
 * leaves an empty row. Neither is a person adding something, and neither may
 * unlock a second message in their name.
 *
 * FALSE ON ANY FAILURE, which keeps the duplicate guard exactly as it was
 * yesterday. The direction matters: a failure here costs the owner a retry,
 * and the other direction costs somebody a second copy of a question they have
 * not answered yet.
 */
async function ownerSpokeSince(taskId: number, secondsAgo: number): Promise<boolean> {
  try {
    const result = await query<{ spoke: boolean }>(
      `SELECT EXISTS (
                SELECT 1
                  FROM conversations c
                  JOIN tasks t ON t.thread_id = c.thread_id
                 WHERE t.id = $1
                   AND c.role = 'user'
                   AND c.kind = 'message'
                   AND TRIM(c.content) <> ''
                   -- "conversations.created_at" has NO time zone. The server
                   -- runs on UTC today, so a bare NOW() happens to work — and
                   -- „happens to work" is how this file already earned one
                   -- „integer = text" P0. Comparing against an explicitly
                   -- naive UTC instant needs no setting to stay true.
                   AND c.created_at > (NOW() AT TIME ZONE 'UTC') - ($2 || ' seconds')::INTERVAL
              ) AS spoke`,
      [taskId, secondsAgo],
      ASK_QUERY_TIMEOUT_MS,
    );
    return result.rows[0]?.spoke === true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[task-asks] could not read the owner's lines for goal ${taskId}:`,
      (err as Error).message,
    );
    return false;
  }
}

/**
 * ROW 274 — THE DECLINE IS RECORDED FROM THE TAP, NOT FROM WHAT IS SENT LATER.
 *
 * ⚠️ AND THIS IS THE FIX FOR A BUTTON THAT WOULD HAVE RECORDED ALMOST NOTHING.
 *
 * The first build put the check in `recordAskAnswer`, which looked right and
 * was nearly useless. Answers do not reach that function as the person typed
 * them: a recipient's words start a run, the model composes an answer, asks
 * them to confirm it, and only then calls `send_answer_to_asker` with
 * `answer_text` OF ITS OWN CHOOSING. So the stored answer is the model's
 * wording after a confirmation round — and an exact string match against our
 * button would have failed on almost every real decline, leaving a count of
 * zero that read as "nobody refuses".
 *
 * Reading it from `keepUserMessage` instead records what the PERSON DID — they
 * pressed our button — independently of anything the model writes afterwards.
 * The relay is unchanged: their answer still goes to the asker the ordinary
 * way, in whatever words the turn settles on.
 *
 * Best-effort by construction. A recipient's message must never fail because a
 * diagnostic column could not be written.
 */
export async function noteDeclineIfButtonPressed(threadId: number, message: string): Promise<void> {
  // A string compare, and it is false for every ordinary message before
  // anything touches the database — this runs on every message in every
  // thread.
  if (!isDeclineChoice(message)) return;
  try {
    await query(
      `UPDATE task_asks
          SET declined_at = COALESCE(declined_at, NOW())
        WHERE id = (
          SELECT id FROM task_asks
           WHERE ask_thread_id = $1 AND status IN ('sent', 'answered')
           ORDER BY id DESC LIMIT 1
        )`,
      [threadId],
      ASK_QUERY_TIMEOUT_MS,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[decline] could not record a refusal:', (err as Error).message);
  }
}

/**
 * ROW 300 — „YES" AND „LATER" ARE TOLD TO THE ASKER AT ONCE, FROM THE TAP.
 *
 * Same reasoning as the decline above: the tap is what the person did, and the
 * model's later wording is not. Before this, a reader who pressed nothing but
 * meant „yes, give me a day" left the asker looking at silence.
 *
 * ONCE PER ASK. The claim and the stamp are one statement guarded by the
 * column being NULL, so a second tap — or the same tap on two devices — finds
 * nothing to claim and writes nothing.
 *
 * „Later" also re-times the one reminder: it clears `reminded_at` so the
 * sweep sends a single reminder 24 hours after the tap (see
 * `sendDueAskReminders`). Because `later_at` is stamped only once, that can
 * happen only once.
 */
export async function answerAskTapAtOnce(threadId: number, message: string): Promise<void> {
  // #1686 (A3): „later" typed in words counts as the button — three days.
  const tap = askTapOf(message) ?? (isTypedLater(message) ? AskTap.Later : null);
  if (tap !== AskTap.Yes && tap !== AskTap.Later) return;
  try {
    const claimed = await claimAskTap(threadId, tap);
    if (claimed === null || claimed.task_thread_id === null) return;
    const language = await userLanguage(String(claimed.from_user_id));
    const readerName = claimed.reader_name?.trim() || unknownSenderName(language);
    // The tester's 42114: the asker learns the day at the tap, not only at the next reply.
    const dayLine =
      tap === AskTap.Later && claimed.later_until
        ? `\n${ownerAskLine(readerName, { status: 'sent', later_until: claimed.later_until }, AskState.Later, language)}`
        : '';
    await saveThreadMessage(
      claimed.task_thread_id,
      claimed.from_user_id,
      'assistant',
      askTapLineForAsker(tap, language, readerName) + dayLine,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[ask-tap] could not tell the asker about a „${tap}" tap:`,
      (err as Error).message,
    );
  }
}

/**
 * #1686 (A3): the reader picked a day for their „later" — the latest open ask
 * on this thread comes back at 09:30 that day, once. Returns the new time, or
 * null when no open ask is on the thread.
 */
export async function setLaterDays(threadId: number, days: number): Promise<Date | null> {
  const result = await query<ClaimedTap & { readonly before: Date | null }>(
    `WITH prev AS (SELECT id, later_until AS before FROM task_asks WHERE id = ${LIVE_ASK_ON_THREAD})
     UPDATE task_asks ta
        SET later_at = COALESCE(later_at, NOW()), reminded_at = NULL,
            later_until = ${LATER_UNTIL_SQL('$2')}
       FROM prev
      WHERE ta.id = prev.id
      RETURNING prev.before, ${CLAIMED_TAP_COLUMNS}`,
    [threadId, days],
    ASK_QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  if (!row?.later_until) return null;
  const until = new Date(row.later_until);
  await tellAskerTheNewDay(row, until);
  return until;
}

/**
 * #1981 (tester 42210): the asker's line was written at the tap with the
 * default day, and the reader's own pick never corrected it — she read Friday
 * while he had said Tomorrow. When the day changes, she gets the day he chose.
 */
async function tellAskerTheNewDay(
  row: ClaimedTap & { readonly before: Date | null },
  until: Date,
): Promise<void> {
  if (row.task_thread_id === null) return;
  if (row.before !== null && new Date(row.before).getTime() === until.getTime()) return;
  try {
    const language = await userLanguage(String(row.from_user_id));
    const readerName = row.reader_name?.trim() || unknownSenderName(language);
    await saveThreadMessage(
      row.task_thread_id,
      row.from_user_id,
      'assistant',
      ownerAskLine(readerName, { status: 'sent', later_until: until }, AskState.Later, language),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ask-later] could not tell the asker the new day:', (err as Error).message);
  }
}

/** When the open ask on this thread comes back, if it is held by a „later". */
export async function laterUntilOnThread(threadId: number): Promise<Date | null> {
  const result = await query<{ later_until: Date | null }>(
    `SELECT later_until FROM task_asks WHERE id = ${LIVE_ASK_ON_THREAD}`,
    [threadId],
    ASK_QUERY_TIMEOUT_MS,
  );
  const until = result.rows[0]?.later_until;
  return until ? new Date(until) : null;
}

interface ClaimedTap {
  readonly from_user_id: number;
  /** #1686: set by a later tap — the day the ask comes back. */
  readonly later_until: Date | null;
  readonly task_thread_id: number | null;
  readonly reader_name: string | null;
}

/** The latest unanswered ask on the thread — the one a tap is about. */
const LIVE_ASK_ON_THREAD = `(SELECT id FROM task_asks
                              WHERE ask_thread_id = $1 AND status = 'sent'
                              ORDER BY id DESC LIMIT 1)`;

const CLAIMED_TAP_COLUMNS = `ta.from_user_id, ta.later_until,
  (SELECT t.thread_id FROM tasks t WHERE t.id = ta.task_id) AS task_thread_id,
  ${ASKED_AS_THE_ASKER_SAVED_THEM} AS reader_name`;

/** One fixed statement per tap; the column being NULL is the once-only guard. */
const CLAIM_TAP_SQL: Readonly<Record<AskTap.Yes | AskTap.Later, string>> = {
  [AskTap.Yes]: `UPDATE task_asks ta SET offered_help_at = NOW()
                  WHERE ta.id = ${LIVE_ASK_ON_THREAD} AND ta.offered_help_at IS NULL
                  RETURNING ${CLAIMED_TAP_COLUMNS}`,
  [AskTap.Later]: `UPDATE task_asks ta SET later_at = NOW(), reminded_at = NULL,
                           later_until = ${LATER_UNTIL_SQL(String(LATER_DEFAULT_DAYS))}
                    WHERE ta.id = ${LIVE_ASK_ON_THREAD} AND ta.later_at IS NULL
                    RETURNING ${CLAIMED_TAP_COLUMNS}`,
};

/** Stamps the tap on the latest unanswered ask of this thread, if it was not stamped already. */
async function claimAskTap(
  threadId: number,
  tap: AskTap.Yes | AskTap.Later,
): Promise<ClaimedTap | null> {
  const result = await query<ClaimedTap>(CLAIM_TAP_SQL[tap], [threadId], ASK_QUERY_TIMEOUT_MS);
  return result.rows[0] ?? null;
}
