import { query } from '../db/postgres/client';
import { getTaskById } from './taskStore.service';
import { planAllows, planInForce, TaskPlan } from './taskPlans.service';
import { AnswerRule, matchAnswerRule, recordRuleUse, saveAnswerRule } from './answerRules.service';
import { sharedRoster } from './roster.service';
import { createThread, saveThreadMessage } from './threads.service';
import { emitThreadCreated } from './sse.service';
import { sendPushNotification } from './notification.service';
import { scrubText } from './privacyScrub';
import { geoName } from './georgianCase';
import { findContactPhonesByName } from './tools/nameMatch';
import { isOptedOutFromAsks } from './askOptOut.service';
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

const ASK_QUERY_TIMEOUT_MS = 8_000;
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
  | 'recipient_daily_limit_reached'
  | 'conversation_ask_limit_reached'
  | 'monthly_ask_budget_reached'
  | 'ask_fatigue_budget_exhausted'
  | 'person_daily_relay_limit_reached';

export type CreateAskOutcome =
  /** `answered_automatically`: the recipient's standing rule answered it (Task 22). */
  | { sent: true; ask_id: number; to_name: string; answered_automatically?: true }
  | { sent: false; error: string; reason?: AskRefusalReason };

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
const CONTINUE_BY_OTHER_ROUTES =
  ' მიზანი არ ჩერდება: ახლავე, ამავე გაშვებაში გააგრძელე სხვა გზებით — ქსელის სხვა ' +
  'შესაფერისი ადამიანები, მეორე წრე, ვები — და ნებართვა ამისთვის არ ჰკითხო. ვისაც ვერ ' +
  'მიწერე, ის ხვალინდელ გეგმაში ჩაწერე და ეს თქვი.';

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
): Promise<number> {
  const thread = await createThread(
    String(toUserId),
    'incoming_ask',
    `${senderName}: ${titleSnippetFrom(safeQuestion)}`,
    undefined,
    {
      isTask: true,
      status: 'needs_you',
      statusLine: 'პასუხს ელოდება',
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

export async function createAsk(
  fromUserId: string,
  taskId: number,
  contactPhone: string,
  question: string,
  parentAskId?: number,
  threadId?: number,
): Promise<CreateAskOutcome> {
  const trimmed = question.trim().slice(0, MAX_QUESTION_CHARS);
  if (!trimmed)
    return { sent: false, reason: 'empty_question', error: 'Pass a non-empty question.' };

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
    if (!task.permission_granted) {
      // The wording matters (ticket 3 §6.8): the old text sent the model back
      // to the user even when consent had JUST been voiced, producing three
      // permission prompts for one send (thread 8152).
      return {
        sent: false,
        reason: 'consent_pending',
        error:
          'ნებართვა არ არის: ამ დავალებაზე grant_task_permission ჯერ არ გამოძახებულა. თუ ' +
          'მომხმარებელს ამ საუბარში თანხმობა უკვე ნათქვამი აქვს („კი, გაუგზავნე") — ხელახლა ' +
          'ნუ ჰკითხავ: გამოიძახე grant_task_permission ახლავე და გაიმეორე ask_contact. თუ ' +
          'თანხმობა ჯერ არ გითხოვია, ჰკითხე ერთხელ და აჩვენე ვის მისწერ და ზუსტად რა ' +
          'ტექსტს. უნებართვოდ გაგზავნა შეუძლებელია — ეს სერვერის წესია.',
      };
    }
    // Ticket 16 Task 99 (D119): a plan proposed and not yet approved is the
    // wall too — goal 1619 carried a legacy grant from August, a proposed plan
    // v1 and no approval, and an ask still went out. Until the yes, nothing new.
    if ((task.plan_proposed ?? null) !== null && planInForce(task) === null) {
      return {
        sent: false,
        reason: 'consent_pending',
        error:
          'გეგმა შეთავაზებულია და მფლობელის „კი" ჯერ არ არის (approve_task_plan). სანამ ' +
          'გეგმა არ დამტკიცდება, ახალი კითხვა არავის არ მიდის — აჩვენე გეგმა და სთხოვე დასტური.',
      };
    }
  }

  // The recipient must be a registered member (format-independent lookup).
  const member = await query<{
    userId: number;
    name: string | null;
    subscriptionStatus: string | null;
  }>(
    `SELECT up."userId", u.name, u.subscription_status AS "subscriptionStatus"
     FROM "UserPhone" up JOIN "User" u ON u.id = up."userId"
     WHERE regexp_replace(up.phone, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')
       AND u."deletedAt" IS NULL
     LIMIT 1`,
    [contactPhone],
    ASK_QUERY_TIMEOUT_MS,
  );
  if (member.rows.length === 0) {
    return {
      sent: false,
      reason: 'recipient_not_member',
      error:
        'ეს კონტაქტი Netai-ს წევრი არ არის — მისწერა ვერ ხერხდება. თუ ეს ადამიანი მეორე წრიდანაა ' +
        '(search_second_degree), მისწერე არა მას, არამედ გამტარს — via_contacts-ის ნომერზე, ' +
        'რომელიც გეგმაშია; მფლობელს კი უთხარი ვინ არის წევრი და ვინ არა, არასოდეს „არავინ არ არის".',
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
  const receivedToday = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM task_asks
     WHERE to_user_id = $1 AND is_follow_up = FALSE
       AND created_at > NOW() - INTERVAL '24 hours'`,
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
    Number(receivedToday.rows[0]?.count ?? 0) >= MAX_ASKS_RECEIVED_PER_PERSON_PER_DAY
  ) {
    return {
      sent: false,
      reason: 'recipient_daily_limit_reached',
      error:
        `${toName}-ს ბოლო 24 საათში უკვე ${MAX_ASKS_RECEIVED_PER_PERSON_PER_DAY} ახალი კითხვა ` +
        'მიუვიდა სხვებისგან — ეს ზღვარი მოძრავ 24 საათზეა, არა კალენდარულ დღეზე. ასევე ' +
        'დაწერე: „ბოლო 24 საათში". „დღეს" არ დაწერო — არც მაშინ იქნება სიმართლე, როცა ' +
        'წერ, არც მოგვიანებით. ' +
        'ეს დღიური ზღვარია ერთ ადამიანზე, რომ არავის გადატვირთოს. ერთი ხაზით უთხარი მფლობელს, ' +
        'ვისი ზღვარია და რატომ. ეს ამ ადამიანის გადაწყვეტილება არ არის.' +
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
  const verdict = planAllows(planInForce(await planRowFor(taskId)), contactPhone);
  if (!verdict.allowed && verdict.reason === 'never_contact') {
    return {
      sent: false,
      reason: 'never_contact',
      error:
        `${toName} მფლობელის გეგმაში „ვის არასდროს" სიაშია — მას არაფერს ვწერთ, არც ამ და არც ` +
        'სხვა გზით. მფლობელს უთხარი, რომ ეს მისი გეგმის წესია და სხვა ადამიანი შესთავაზე.',
    };
  }
  if (!verdict.allowed && parentAskId === undefined) {
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
  const live = await query<{ ask_thread_id: number | null; status: string }>(
    `SELECT ask_thread_id, status FROM task_asks
     WHERE task_id = $1 AND to_user_id = $2 AND status IN ('sent', 'answered')
     ORDER BY id DESC LIMIT 1`,
    [taskId, toUserId],
    ASK_QUERY_TIMEOUT_MS,
  );
  const liveThreadId = live.rows[0]?.ask_thread_id ?? null;
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
  const isFollowUp = live.rows[0]?.status === 'answered';
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
  const senderName = fromName.rows[0]?.name?.trim() || 'Netai-ს მომხმარებელი';

  // The question crosses accounts — scrub it.
  const safeQuestion = scrubText(trimmed);
  // A follow-up lands in the conversation it belongs to; only a first ask
  // opens a thread. Two threads for one exchange would put the answer and the
  // question that followed it in different rooms (ticket 9 task 12).
  const askThreadId = liveThreadId ?? (await openAskThread(toUserId, senderName, safeQuestion));
  // Two members of one network who never saved each other's number (Ticket
  // 10 Task 23, D121): the recipient's opening line says so (D57) — that is
  // what makes a stranger's question a colleague's rather than spam.
  const roster = sameThread
    ? null
    : await sharedRoster(fromUserId, String(toUserId)).catch(() => null);
  const senderLine = roster
    ? `${geoName(senderName, 'gen')} (${roster}-ის წევრი, როგორც შენ) ასისტენტი`
    : `${geoName(senderName, 'gen')} ასისტენტი`;
  // Plain text, no markdown: the recipient-side renderer shows the asterisks
  // verbatim (ticket 3 §6.3).
  /**
   * Three openings, because there are three situations and there were two.
   *
   * „კიდევ დაწერა" — „wrote AGAIN" — is a true sentence only about somebody who
   * has already replied. Said to a person who has not, forty-one seconds after
   * the first message, above the identical question, it reads as being chased
   * by a machine. That is what the seat found on two consecutive days.
   *
   * The third case is not a chase and not a first contact: the owner's side had
   * more to say before an answer came. „დაამატა" — added — is what actually
   * happened, and it does not accuse the reader of ignoring anything.
   */
  const followUpLine = `${geoName(senderName, 'gen')} ასისტენტმა კიდევ დაწერა:`;
  const addedLine = `${geoName(senderName, 'gen')} ასისტენტმა დაამატა:`;
  const firstLine = `${senderLine} გეკითხება:`;
  const lead = isFollowUp ? followUpLine : sameThread ? addedLine : firstLine;
  const opening =
    `${lead}\n\n"${safeQuestion}"\n\n` + 'უბრალოდ მიპასუხე ამ თრედში — პასუხს მე გადავცემ.';
  await saveThreadMessage(askThreadId, toUserId, 'assistant', opening);
  // The badge on a continued conversation goes back to waiting-on-them —
  // something has just been asked of them, whether or not they answered the
  // last one. The old comment here said „their last reply closed the previous
  // round", which was the assumption nobody checked.
  if (sameThread) {
    await setThreadStatus(String(toUserId), askThreadId, 'needs_you', {
      statusLine: 'პასუხს ელოდება',
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
                            parent_ask_id, origin_thread_id, is_follow_up, origin_user_id)
     VALUES ($1, $2::int, $3, $4, $5, $6, $7, $8, $9::int)
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
    ],
    ASK_QUERY_TIMEOUT_MS,
  );
  // Ticket 13 Task 42 (7): the same goal now asks a DIFFERENT person than it
  // asked before — the requester rerouted. Recorded once per goal.
  if (!sameThread) void recordReroutedIfSecondRoute(fromUserId, taskId, toUserId);

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
      await answerAutomatically(ask.rows[0].id, askThreadId, String(toUserId), rule);
      return { sent: true, ask_id: ask.rows[0].id, to_name: toName, answered_automatically: true };
    }
  }

  void sendPushNotification(String(toUserId), {
    title: `Netai — ${senderName} გეკითხება`,
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
): Promise<void> {
  const captured = await recordAskAnswer(askThreadId, rule.answer);
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
    `შენი წესით („${rule.kind}") ავტომატურად ვუპასუხე:\n\n"${rule.answer}"\n\n` +
      'თუ ეს წესი აღარ გინდა, მითხარი და გავაუქმებ — შემდეგ ჯერზე ისევ შენ გკითხავ.',
  );
  await setThreadStatus(recipientUserId, askThreadId, 'done', { isTask: true });
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
  firstAnswer: boolean;
  answer: string;
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
         answered_at = COALESCE(answered_at, NOW())
     WHERE id = (
       SELECT id FROM task_asks
       WHERE ask_thread_id = $1 AND status IN ('sent', 'answered')
       ORDER BY id DESC LIMIT 1
     )
     RETURNING id, task_id, answer`,
    [askThreadId, safe],
    ASK_QUERY_TIMEOUT_MS,
  );
  const row = updated.rows[0];
  if (!row) return null;
  // firstAnswer = this message IS the whole stored answer, i.e. the round had
  // nothing before it. Read off the updated row itself.
  const firstAnswer = row.answer === safe;
  const check = await query<{ from_name: string | null }>(
    `SELECT u.name AS from_name
     FROM task_asks ta LEFT JOIN "User" u ON u.id = ta.to_user_id
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
    firstAnswer,
    answer: safe,
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
export async function sendApprovedAskAnswer(
  recipientUserId: string,
  askThreadId: number,
  approvedText: string,
  // Ticket 10 Task 22 (D120): the second thing the confirm turn asks — "and
  // answer similar questions this way in future". Given only on the user's
  // explicit yes to THAT; the rule is written after the answer has gone.
  remember?: { kind: string },
): Promise<{ sent: boolean; error?: string; rule_saved?: boolean; rule_error?: string }> {
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

  const captured = await recordAskAnswer(askThreadId, approvedText);
  if (!captured) {
    return { sent: false, error: 'პასუხის ჩაწერა ვერ მოხერხდა — სცადე ხელახლა.' };
  }

  await deliverCapturedAnswer(captured, recipientUserId);

  if (remember === undefined) return { sent: true };
  const saved = await saveAnswerRule(recipientUserId, remember.kind, row.question, approvedText);
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
    try {
      const { wakeTask } = await import('./taskEngine.service');
      const delivered = await wakeTask(
        captured.taskId,
        relay
          ? buildRelayAnswerWakeEvent(captured.answer, captured.fromName, relay.bridgeName)
          : buildAnswerWakeEvent(captured.answer, captured.fromName),
        { text: captured.answer, who: captured.fromName },
      );
      if (delivered === 'woken') await markAskWakeDelivered(captured.askId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ask-wake] failed (sweep will retry):', (err as Error).message);
    }
    if (relay) await thankTheBridge(relay, captured.fromName);
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
  readonly bridgeUserId: number;
  readonly bridgeThreadId: number | null;
  readonly bridgeName: string | null;
}

async function relayShapeOf(childAskId: number): Promise<RelayShape | null> {
  const result = await query<{
    bridge_user_id: number;
    bridge_thread_id: number | null;
    bridge_name: string | null;
  }>(
    `SELECT p.to_user_id   AS bridge_user_id,
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
    bridgeUserId: row.bridge_user_id,
    bridgeThreadId: row.bridge_thread_id,
    bridgeName: row.bridge_name,
  };
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
  // „გიპასუხა" is an aorist, so its subject is ergative: ერეკლემ, not ერეკლე.
  const who = namedName?.trim() ? geoName(namedName.trim(), 'erg') : 'ადამიანმა';
  try {
    await saveThreadMessage(
      relay.bridgeThreadId,
      relay.bridgeUserId,
      'assistant',
      `${who} გიპასუხა და პასუხი კითხვის ავტორს გადაეცა. დიდი მადლობა, რომ დააკავშირე.`,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[relay-close] thank-you to the bridge failed:', (err as Error).message);
  }
}

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
    'მფლობელს გადაეცი სიტყვასიტყვით, ციტატად, დაასახელე ვინ უპასუხა და ვისი მეშვეობით — თუ ' +
    'სხვა ენაზეა, თარგმანიც დაურთე. თუ პასუხი დათანხმებაა, შესთავაზე მფლობელს, რომ პირველი ' +
    'შეტყობინება თავად დაწეროს, და დაეხმარე ერთი-ორი წინადადებით — სწორედ იმაზე, რაც მას ამ ' +
    'შეხვედრიდან სჭირდება. თუ უარია, მოკლედ და თბილად თქვი და ნუ დაუბრუნდები. შემდეგ გააგრძელე ' +
    'დავალება.'
  );
}

/**
 * The wake event for an arrived answer. Tag-delimited, NOT quote-wrapped:
 * a quote inside the answer broke the quoted form and the asker received a
 * raw fragment (ticket 4 blocker 3, thread 8201). The responder is named
 * (item 0C.3): an answer that arrives anonymously reads as the assistant's own
 * curiosity, so the owner has no reason to treat it as someone waiting.
 */
export function buildAnswerWakeEvent(answer: string, fromName?: string | null): string {
  const who = fromName?.trim() ? fromName.trim() : 'ადამიანმა, ვისაც კითხვა გაეგზავნა';
  return (
    `${who} გიპასუხა შენს გაგზავნილ კითხვაზე. პასუხის ზუსტი ტექსტი <answer> ტეგებს შორისაა:\n` +
    `<answer>\n${answer}\n</answer>\n` +
    `მფლობელს გადაეცი სიტყვასიტყვით, ციტატად, და დაასახელე ვინ უპასუხა (${who}) — თუ სხვა ენაზეა, ` +
    'თარგმანიც დაურთე. თუ ეს პასუხი კითხვაა, მფლობელს ახსენი, რომ ადამიანი პასუხს ელოდება. ' +
    'შემდეგ გააგრძელე დავალება.'
  );
}

/** What an answer-wake run's final reply MUST contain, verbatim. */
export interface EnsureQuoted {
  readonly text: string;
  readonly who: string | null;
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
export function ensureVerbatimQuote(reply: string, ensure: EnsureQuoted): string {
  const norm = (s: string): string => s.replace(QUOTE_NORM_RE, ' ').trim();
  const answer = ensure.text.trim();
  if (!answer) return reply;
  if (norm(reply).includes(norm(answer))) return reply;
  const attribution = ensure.who?.trim() ? ` — ${ensure.who.trim()}` : '';
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
}

/** Answered asks whose owning task was never woken — the sweep's worklist. */
export async function listUnwokenAnswers(limit: number): Promise<UnwokenAnswer[]> {
  const result = await query<UnwokenAnswer>(
    `SELECT ta.id, ta.task_id, ta.answer, u.name AS from_name, t.status AS task_status,
            t.thread_id AS task_thread_id
     FROM task_asks ta
     LEFT JOIN tasks t ON t.id = ta.task_id
     LEFT JOIN "User" u ON u.id = ta.to_user_id
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
    `SELECT ta.id, ta.task_id, ta.to_user_id, u.name AS to_name, ta.status,
            ta.question, ta.answer, ta.created_at
     FROM task_asks ta
     LEFT JOIN "User" u ON u.id = ta.to_user_id
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
    `SELECT ta.id AS ask_id, u.name AS from_name, ta.question, ta.created_at
     FROM task_asks ta
     LEFT JOIN "User" u ON u.id = ta.from_user_id
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
  for (const row of cancelled.rows) {
    if (row.ask_thread_id === null) continue;
    await saveThreadMessage(
      row.ask_thread_id,
      row.to_user_id,
      'assistant',
      'ეს კითხვა აღარ არის აქტუალური — პასუხი აღარ არის საჭირო. მადლობა!',
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
export async function getAskByThread(askThreadId: number): Promise<IncomingAsk | null> {
  const result = await query<IncomingAsk>(
    `SELECT ta.id, ta.task_id, ta.question, ta.status, u.name AS from_name
     FROM task_asks ta
     LEFT JOIN "User" u ON u.id = ta.from_user_id
     WHERE ta.ask_thread_id = $1
     ORDER BY ta.id DESC LIMIT 1`,
    [askThreadId],
    ASK_QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

// THE fix for ticket 4 items 0A/0AA: a relay failure is NOT an answer failure.
// The recipient's own reply is captured and delivered the instant they send it,
// on a completely separate path; relay_ask is only the EXTRA hop that forwards
// the question to a third person. On 11 Aug the recipient was told "ამის
// გადაცემა ვერ მოხერხდა" four times while the asker had her answer every time —
// she was being shown the result of the contact lookup, not of the delivery.
// Every relay outcome now carries that distinction in the text itself.
const RELAY_ALREADY_DELIVERED =
  ' მნიშვნელოვანი: მომხმარებლის პასუხი კითხვის ავტორს უკვე გადაეცა — ეს ცალკე, ავტომატური გზაა და ' +
  'ყოველთვის მუშაობს. აქ საქმე მხოლოდ დამატებით გადაგზავნას ეხება. არასოდეს თქვა, რომ პასუხი ვერ ' +
  'გადაიცა ან დაიკარგა — ეს ტყუილი იქნებოდა.';
// Appended to every FAILED relay outcome: the model on the recipient's side of
// an ask must close neutrally — a refusal must never surface as "system error"
// and must never end with "contact them directly" (ticket 3 §1, code-enforced
// because two prompt rewrites failed to hold it).
const RELAY_NEUTRAL_CLOSE =
  ' დამატებითი გადაგზავნა ვერ მოხერხდა — მომხმარებელს ეს ერთი მშვიდი წინადადებით უთხარი და ' +
  'აუცილებლად დაამატე, რომ მისი პასუხი კითხვის ავტორმა მიიღო. „სისტემური შეცდომა" არ ახსენო და ' +
  'არასოდეს ურჩიო კითხვის ავტორთან ან სხვასთან პირდაპირ დაკავშირება.' +
  RELAY_ALREADY_DELIVERED;

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
  'კონტაქტის სახელი ცარიელია — გადაგზავნა არ მომხდარა და არც იყო საჭირო.' + RELAY_ALREADY_DELIVERED;
// Ticket 4 item 0C.1b: naming a person IS the answer — a recommendation, not a
// relay request. The name already reached the asker as plain text through the
// automatic capture, so a failed lookup must end in a thank-you, never in an
// apology and never in "spell it for me": no recipient will work out which
// script their own phonebook uses.
const RELAY_NOT_FOUND_ERROR =
  'ეს სახელი მომხმარებლის კონტაქტებში ვერ მოიძებნა, ამიტომ მისთვის ცალკე კითხვა არ გაგზავნილა — ' +
  'და არც არის საჭირო: სახელი კითხვის ავტორს უკვე მივიდა, როგორც რეკომენდაცია. მადლობა უთხარი და ' +
  'დაასრულე. ორთოგრაფია არ ჰკითხო, ვარაუდები ნუ ჩამოთვლი და ბოდიში არ მოიხადო.' +
  RELAY_ALREADY_DELIVERED;
const RELAY_AMBIGUOUS_ERROR =
  'ამ სახელს რამდენიმე კონტაქტი ემთხვევა, ამიტომ ცალკე კითხვა არავის გაგზავნია. თუ მომხმარებელმა ' +
  'გადაგზავნა ნამდვილად ითხოვა, ჰკითხე სრული სახელი და გვარი; თუ უბრალოდ ადამიანს ასახელებდა — ' +
  'მადლობა უთხარი და დაასრულე. კანდიდატები ნუ ჩამოთვლი.' +
  RELAY_ALREADY_DELIVERED;
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
  if (outcome.sent || RELAY_RESOLUTION_ERRORS.has(outcome.error)) return outcome;
  return { sent: false, error: outcome.error + RELAY_NEUTRAL_CLOSE };
}

async function relayAskInner(
  relayerUserId: string,
  parentAskId: number,
  contact: string,
  question?: string,
): Promise<CreateAskOutcome> {
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

// One polite reminder per unanswered ask, after this long.
const ASK_REMINDER_AFTER_HOURS = 48;

export async function sendDueAskReminders(limit: number): Promise<number> {
  const due = await query<{ ask_thread_id: number | null; to_user_id: number }>(
    `UPDATE task_asks SET reminded_at = NOW()
     WHERE id IN (
       SELECT id FROM task_asks
       WHERE status = 'sent' AND reminded_at IS NULL
         AND created_at < NOW() - INTERVAL '${ASK_REMINDER_AFTER_HOURS} hours'
       ORDER BY created_at
       LIMIT $1
     )
     RETURNING ask_thread_id, to_user_id`,
    [limit],
    ASK_QUERY_TIMEOUT_MS,
  );
  for (const row of due.rows) {
    if (row.ask_thread_id === null) continue;
    await saveThreadMessage(
      row.ask_thread_id,
      row.to_user_id,
      'assistant',
      'შეხსენება: ეს კითხვა ჯერ უპასუხოა — თუ ერთი წუთი გაქვს, პასუხი ძალიან გამოადგება. თუ არ იცი, ისიც მომწერე და აღარ შეგაწუხებ.',
    ).catch(() => undefined);
    void sendPushNotification(String(row.to_user_id), {
      title: 'Netai — შეხსენება',
      body: 'უპასუხო კითხვა გელოდება.',
      url: `/chat/${row.ask_thread_id}`,
    }).catch(() => undefined);
  }
  return due.rows.length;
}
