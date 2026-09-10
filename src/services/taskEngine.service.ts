import { randomUUID } from 'crypto';
import { processChat } from './chat.service';
import {
  getTaskById,
  getDueTasks,
  getStaleOpenTasks,
  getGoalsUnansweredForADay,
  markQuestionDefaulted,
  getSilentGoals,
  markSilentDayWoken,
  getGoalsSilentForDays,
  markMethodChangeWoken,
  ensureNextWake,
  touchTaskActivity,
  clearTaskWake,
  Task,
} from './taskStore.service';
import {
  sendDueAskReminders,
  listUnwokenAnswers,
  markAskWakeDelivered,
  buildAnswerWakeEvent,
  hasPendingAskForThread,
  EnsureQuoted,
} from './taskAsks.service';
import { getThread, saveThreadMessage } from './threads.service';
import { setThreadStatus, endsWithQuestion } from './threadStatus.service';
import { describeAskBudget, AskBudgetState } from './askBudget.service';
import { markRunFailed } from './runFailure.service';
import { flagGoalNeedsOwner, goalQuestionFlaggedSince } from './goalQuestions.service';
import { emitRunComplete, emitRunError, hasActiveConnection } from './sse.service';
import { sendPushNotification } from './notification.service';
import { checkRunAllowance } from './tokenWallet.service';
import { scrubText } from './privacyScrub';
import { sweepUnansweredIntroOutcomes } from './partH.service';
import { sendWeeklySummaries } from './weeklySummary.service';
import { RUN_HARD_TIMEOUT_MS } from '../config/runBudgets';

const TICK_INTERVAL_MS = 60_000;
const REMINDER_INTERVAL_MS = 60 * 60_000;
const MAX_REMINDERS_PER_SWEEP = 10;
// Answer-wake backstop (ticket 4 blocker 1): re-deliver any answered ask whose
// task never woke — a deploy-window failure is late by minutes, not by a day.
const UNWOKEN_SWEEP_INTERVAL_MS = 5 * 60_000;
const MAX_UNWOKEN_PER_SWEEP = 10;
// Nightly review (the matcher, v1): quiet open tasks get one model-driven
// re-check per night — new members/tags/facts since yesterday surface through
// the same searches the task already knows how to run.
const NIGHTLY_REVIEW_HOUR_UTC = 2; // 06:00 Tbilisi, after the enrichment window
const NIGHTLY_REVIEW_QUIET_HOURS = 20;
const MAX_NIGHTLY_REVIEWS = 10;
// How many due tasks one tick advances — engine runs share the model budget
// with live users and must trickle, not burst.
const MAX_WAKES_PER_TICK = 2;
const PUSH_PREVIEW_MAX_CHARS = 120;

// A task advances one step at a time: never two concurrent runs on one task.
const runningTasks = new Set<number>();

/**
 * What the wake must know about this account's outreach budget (ticket 9 task
 * 17). Silent while there is room — a plan does not need to hear about a
 * budget it cannot exhaust — and explicit when there is none, so the run stops
 * proposing a send the tool would refuse and stops promising it to the owner.
 *
 * A live relayed conversation is deliberately NOT stopped by this: continuing
 * one spends the recipient's daily patience, not the month's growth budget.
 */
export function outreachNoteFor(budget: AskBudgetState | null): string {
  // D134: the sending side is uncapped (null) unless the fatigue brake is on.
  if (budget === null || budget.remaining_this_month === null || budget.remaining_this_month > 0) {
    return '';
  }
  return (
    '\n\n[სისტემა] ამ ანგარიშს ამ თვეში ახალი კითხვის გაგზავნის ბიუჯეტი ამოწურული აქვს — ' +
    'ask_contact ახალ ადამიანთან ვერ გაივლის. ნუ შესთავაზებ მფლობელს მიწერას და ნურაფერს ' +
    'დაპირდები, რასაც ვერ გააკეთებ; იმუშავე იმით, რაც ხელთ გაქვს (ძებნა, უკვე დაწყებული ' +
    'მიმოწერის გაგრძელება, გაცნობის თხოვნა). თუ მფლობელი თავად იკითხავს — უთხარი, რომ ' +
    `ლიმიტი ${budget.window_resets_at.slice(0, 10)}-ს განახლდება.`
  );
}

/**
 * Advance a task by one engine-initiated run: the event text enters the task's
 * thread as a normal turn (so history carries it), the run works with tools,
 * and the outcome is delivered exactly like a user-triggered run — SSE,
 * statuses, push when the owner is away.
 *
 * Returns whether the event actually entered the thread — false on every
 * guard exit (closed task, busy thread, empty wallet, run crash). Callers
 * that must guarantee delivery (the answer-wake path) use this to decide
 * whether to mark the wake delivered or leave it for the sweep.
 */
export async function wakeTask(
  taskId: number,
  eventText: string,
  // Answer wakes carry the verbatim answer; the run's reply provably quotes it.
  ensureQuoted?: EnsureQuoted,
): Promise<boolean> {
  if (runningTasks.has(taskId)) return false;
  runningTasks.add(taskId);
  try {
    const task = await getTaskById(taskId);
    if (!task || task.status !== 'open' || task.thread_id === null) return false;
    const ownerId = String(task.user_id);
    const thread = await getThread(task.thread_id, ownerId);
    if (!thread) return false;
    if (thread.status === 'working') return false; // a live run owns the thread right now

    // Engine runs spend the owner's tokens like any other run — an exhausted
    // balance pauses the task visibly instead of failing silently.
    const allowance = await checkRunAllowance(ownerId);
    if (!allowance.allowed) {
      await setThreadStatus(ownerId, thread.id, 'needs_you', {
        statusLine: 'ტოკენები ამოიწურა',
      });
      await saveThreadMessage(
        thread.id,
        Number(ownerId),
        'assistant',
        'დავალებაზე მუშაობა შევაჩერე — ტოკენები ამოიწურა. შევსების შემდეგ გავაგრძელებ.',
      ).catch(() => undefined);
      return false;
    }

    const runId = randomUUID();
    void setThreadStatus(ownerId, thread.id, 'working');
    // A wake that proposes something the tool will refuse wastes the run and
    // hands the owner a promise nobody can keep (ticket 9 task 17: four goals
    // woke every night offering asks while the account's budget was zero). The
    // event carries the state of the budget, so the plan is made knowing it.
    const budgetNote = outreachNoteFor(
      await describeAskBudget(ownerId).catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[task-engine] budget read failed:', (err as Error).message);
        return null;
      }),
    );

    const hardTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('RUN_HARD_TIMEOUT')), RUN_HARD_TIMEOUT_MS),
    );
    const runStartedAt = new Date();
    try {
      const result = await Promise.race([
        processChat(ownerId, thread.id, `[მოვლენა] ${eventText}${budgetNote}`, runId, ensureQuoted),
        hardTimeout,
      ]);
      if (result.runFailed === true) {
        emitRunError(ownerId, thread.id, runId, result.reply);
        void markRunFailed(ownerId, thread.id, result.language ?? 'ka');
        // The event itself was persisted into the thread before the run died —
        // it is delivered; the task will see it on its next step.
        return true;
      }
      emitRunComplete(ownerId, thread.id, runId, {
        reply: result.reply,
        ...(result.taskResult && { result: result.taskResult }),
      });
      // Ticket 8 Task 2(b): in an ENGINE run the reply's audience is the owner
      // — a question here means "blocked on the owner", and that outranks the
      // third-party wait (the inverse of the user-run rule, where a chatty
      // acknowledgement ending in "?" must not beat a pending ask — B2).
      // The model registers its question via ask_owner_decision; the fallback
      // catches a questioning reply it forgot to register and files the same
      // pending item, so the question reaches the one list either way.
      const flagged = await goalQuestionFlaggedSince(taskId, runStartedAt).catch(() => false);
      const asksOwner =
        flagged ||
        result.choices !== undefined ||
        result.options !== undefined ||
        endsWithQuestion(result.reply);
      // A task whose question is unanswered on someone else's phone is waiting,
      // not finished (ticket 4 item 0C.5).
      const pendingAsk = await hasPendingAskForThread(thread.id).catch(() => false);
      const status = asksOwner
        ? 'needs_you'
        : result.requestCreated || pendingAsk
          ? 'waiting'
          : 'done';
      if (asksOwner && !flagged) {
        // No text: a wake reply may cover several goals, and its closing
        // paragraph is not reliably THIS goal's question (live, 1 Sep: goal
        // 1420's reply closed on another goal's question and filed it as its
        // own). The badge and the goal title are attributable; the text is not.
        await flagGoalNeedsOwner(ownerId, taskId).catch((err: unknown) =>
          // eslint-disable-next-line no-console
          console.error('[goal-question] fallback flag failed:', (err as Error).message),
        );
      }
      void setThreadStatus(ownerId, thread.id, status, { isTask: true });
      if (!hasActiveConnection(ownerId)) {
        const preview = scrubText(result.reply).replace(/\s+/g, ' ').trim();
        void sendPushNotification(ownerId, {
          title: 'Netai — დავალებაზე სიახლეა',
          body:
            preview.length > PUSH_PREVIEW_MAX_CHARS
              ? preview.slice(0, PUSH_PREVIEW_MAX_CHARS - 1).trimEnd() + '…'
              : preview || 'დავალებაზე სიახლეა',
          url: `/chat/${thread.id}`,
        }).catch(() => undefined);
      } else {
        // eslint-disable-next-line no-console
        console.log(`[push] user ${ownerId}: skipped task push, SSE looks active`);
      }
      return true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[task-engine] wake failed for task ${taskId}:`, (err as Error).message);
      emitRunError(ownerId, thread.id, runId, 'დავალების ნაბიჯი ვერ დასრულდა — მოგვიანებით ვცდი.');
      void markRunFailed(ownerId, thread.id);
      await saveThreadMessage(
        thread.id,
        Number(ownerId),
        'assistant',
        'დავალების ნაბიჯი ვერ დასრულდა — მოგვიანებით თავად ვცდი ხელახლა.',
        'error',
      ).catch(() => undefined);
      return false;
    }
  } finally {
    runningTasks.delete(taskId);
  }
}

/**
 * Deliver wakes that the live capture path dropped (crash, deploy window,
 * busy thread). A closed task gets marked without a wake — there is nothing
 * left to deliver to; a busy thread stays unmarked and retries next sweep.
 */
async function sweepUnwokenAnswers(): Promise<void> {
  const due = await listUnwokenAnswers(MAX_UNWOKEN_PER_SWEEP);
  let delivered = 0;
  for (const ask of due) {
    if (ask.task_status !== 'open') {
      await markAskWakeDelivered(ask.id);
      continue;
    }
    // A goal opened through the connector carries no thread, so a wake has no
    // room to enter and wakeTask returns false for ever — ten such rows would
    // fill the sweep's worklist and starve every real one behind them. The
    // answer is not lost: it is on the ask, and the task's own prompt section
    // reads its asks. Mark it and move on.
    if (ask.task_thread_id === null) {
      // eslint-disable-next-line no-console
      console.log(
        `[task-engine] ask ${ask.id}: task ${ask.task_id} has no thread, nothing to wake`,
      );
      await markAskWakeDelivered(ask.id);
      continue;
    }
    const woken = await wakeTask(
      ask.task_id,
      buildAnswerWakeEvent(ask.answer ?? '', ask.from_name),
      {
        text: ask.answer ?? '',
        who: ask.from_name,
      },
    );
    if (woken) {
      await markAskWakeDelivered(ask.id);
      delivered += 1;
    }
  }
  if (delivered > 0) {
    // eslint-disable-next-line no-console
    console.log(`[task-engine] answer-wake sweep re-delivered ${delivered} wake(s)`);
  }
}

/**
 * The wake an open goal falls back to when a run ends without scheduling one
 * (Ticket 10 Task 10 (1): `next_wake_at` is never null on an open goal). A
 * day, so a goal the model forgot to reschedule is still revisited tomorrow,
 * not parked until the nightly review's quiet threshold happens to catch it.
 */
const DEFAULT_NEXT_WAKE_HOURS = 24;

async function tick(): Promise<void> {
  const due = await getDueTasks(MAX_WAKES_PER_TICK);
  for (const task of due) {
    // Clear FIRST so a failing run doesn't hot-loop every tick; the model
    // re-schedules with set_task_wake when it still needs a revisit.
    await clearTaskWake(task.id);
    await wakeTask(
      task.id,
      'დაგეგმილი შემოწმების დროა — გადახედე დავალებას და გადადგი შემდეგი ნაბიჯი.',
    );
    // Line 9: the engine never parks a goal. If the run set no wake, the
    // default does — and the row can never read `next_wake_at: null` again.
    await ensureNextWake(task.id, DEFAULT_NEXT_WAKE_HOURS).catch((err: unknown) =>
      // eslint-disable-next-line no-console
      console.error('[task-engine] default wake failed:', (err as Error).message),
    );
  }
}

/**
 * Line 1 of the standard, in code (Ticket 12 Task 2; D146 Task 5): the day
 * the plan is approved, the work starts — the sweep, the web, the first three
 * to five asks to the people the plan names — and it starts in the background,
 * AFTER the assistant has told the user „I am on it". The approval call
 * returns at once; this wake runs behind it. If the run sets no wake of its
 * own, the default of a day is set, so the goal is never without a next check.
 */
const DAY_ONE_DELAY_MS = 3_000;
// The approval happens INSIDE the user's run, which still owns the thread for
// a while after approve_task_plan returned — the founder's 10 Sep test (thread
// 14158): one attempt at +3 s met `status: working`, returned false, and day
// one never happened (D160). The wake now waits for the thread to be free.
const WAKE_RETRY_DELAY_MS = 4_000;
const WAKE_RETRY_ATTEMPTS = 8;

const DAY_ONE_EVENT =
  'გეგმა ახლახან დამტკიცდა — დღე პირველია. სტანდარტის პირველი წესი: ყველაფერი დღესვე. ' +
  'გეგმის „ვის ვკითხავ" სიიდან მისწერე პირველ 3–5 ადამიანს ერთდროულად — ცალკე თანხმობა არ ' +
  'სჭირდება და ტექსტების ჩვენება-დადასტურებაც არა: გეგმა დამტკიცებულია და ეს თანხმობაა (D119). ' +
  'გაუშვი ვებ-ძებნა და ქსელის ძებნა გეგმის გზებით, და set_task_wake-ით დანიშნე შემდეგი ' +
  'შემოწმება. ბოლოს ერთი სტრიქონი: რა მიდის ახლა, ვის ვკითხე, როდის დავბრუნდები.';

/**
 * Wake a goal as soon as its thread is free: the first attempt after `delayMs`,
 * then every WAKE_RETRY_DELAY_MS until wakeTask enters the thread or the
 * attempts run out. `stillWanted` is re-read before every attempt so a goal
 * that closed, or already got what the wake would bring, is left alone.
 */
function wakeWhenFree(
  taskId: number,
  eventText: string,
  stillWanted: () => Promise<boolean>,
  onWoken: () => Promise<void>,
  delayMs: number,
  attempt = 1,
): void {
  setTimeout(() => {
    void stillWanted()
      .then(async (wanted) => {
        if (!wanted) return;
        const woken = await wakeTask(taskId, eventText);
        if (woken) {
          await onWoken();
          return;
        }
        if (attempt < WAKE_RETRY_ATTEMPTS) {
          wakeWhenFree(taskId, eventText, stillWanted, onWoken, WAKE_RETRY_DELAY_MS, attempt + 1);
        } else {
          // eslint-disable-next-line no-console
          console.error(
            `[task-engine] task ${taskId}: thread still busy after ${attempt} attempts`,
          );
        }
      })
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error(`[task-engine] wake failed for task ${taskId}:`, (err as Error).message),
      );
  }, delayMs).unref();
}

async function goalOpen(taskId: number): Promise<boolean> {
  const task = await getTaskById(taskId);
  return task !== null && task.status === 'open';
}

export function startDayOne(taskId: number): void {
  wakeWhenFree(
    taskId,
    DAY_ONE_EVENT,
    () => goalOpen(taskId),
    async () => {
      await ensureNextWake(taskId, DEFAULT_NEXT_WAKE_HOURS);
    },
    DAY_ONE_DELAY_MS,
  );
}

/**
 * A goal opened from an ordinary conversation gets its plan in an engine
 * turn of its own (Answers-12 item 11, plate rows [1][2][5]): the run that
 * saved the goal ran in quick_answer mode, whose prompt knows nothing about
 * plans, so both test goals of 10 Sep were saved and then answered with a
 * question — plan v0, nothing to approve. The thread is bound to the goal
 * from the moment it exists, so this wake runs in task_step mode and the
 * model proposes the plan for the owner's yes. Nobody is contacted here —
 * asks need the approved plan (D119). The user's run still owns the thread
 * for a few seconds after the tool returned, so the wake is retried until
 * the thread is free; a goal that meanwhile got a plan or closed is left alone.
 */
const PLAN_PROPOSAL_DELAY_MS = 4_000;
const PLAN_PROPOSAL_EVENT =
  'მიზანი ახლახან შეინახა და გეგმა ჯერ არ არსებობს. შეადგინე გეგმა და დადე propose_task_plan-ით: ' +
  'ვინ წყვეტს ამას (რამდენიმე თუა — ყველა), რომელი გზებით მივალთ (მფლობელის ქსელი, მეორე წრე, ვები), ' +
  'ვის ვკითხავთ სახელებით, დასრულების ნიშანი. მერე მოკლედ აჩვენე მფლობელს და სთხოვე დასტური — ' +
  'ბოლოს present_choices-ით ორი ღილაკი: „დამტკიცებულია" და „შევცვალოთ". ' +
  'არავის არ მისწერო და არაფერი გაუშვა, სანამ გეგმა არ დამტკიცდება.';

async function planStillMissing(taskId: number): Promise<boolean> {
  const task = await getTaskById(taskId);
  if (!task || task.status !== 'open') return false;
  return task.plan === null && task.plan_proposed === null;
}

export function startPlanProposal(taskId: number): void {
  wakeWhenFree(
    taskId,
    PLAN_PROPOSAL_EVENT,
    () => planStillMissing(taskId),
    () => Promise.resolve(),
    PLAN_PROPOSAL_DELAY_MS,
  );
}

/**
 * Line 4 of the standard, in code (Ticket 10 Task 24 (b)): three silent days
 * change the method. A goal with a plan whose newest ask has waited three days
 * with nothing newer sent or answered is woken once with the instruction to
 * PROPOSE a method change — a plan change, so a new yes — while the approved
 * routes keep running. Stamped before the wake; not repeated for three days;
 * skipped while a proposed plan already waits for the owner.
 */
const METHOD_CHANGE_HOURS = 72;
const MAX_METHOD_CHANGE_WAKES_PER_SWEEP = 5;

export async function sweepMethodChanges(): Promise<number> {
  const stuck = await getGoalsSilentForDays(METHOD_CHANGE_HOURS, MAX_METHOD_CHANGE_WAKES_PER_SWEEP);
  let woken = 0;
  for (const task of stuck) {
    await markMethodChangeWoken(task.id);
    const ok = await wakeTask(
      task.id,
      'სამი დღეა კითხვებს პასუხი არ მოჰყოლია და ახალი არავის მისწერია. სტანდარტის წესია: სამი ' +
        'ჩუმი დღე = მეთოდი შეცვალე, არა მეტი ლოდინი. propose_task_plan-ით შესთავაზე მფლობელს ' +
        'ახალი გზა ან ახალი წრე (სხვა ადამიანები, ვებ-ძიება, პირდაპირი მიმართვა მისი სახელით) — ' +
        'ეს გეგმის ცვლილებაა და მისი „კი" სჭირდება; დამტკიცებული გზები კი უწყვეტად გრძელდება. ' +
        'ბოლოს ერთი სტრიქონი: რა მიდის ახლა, ვის ვკითხე, როდის დავბრუნდები.',
    );
    if (ok) woken++;
  }
  return woken;
}

/**
 * Line 6 of the standard (D117): a question to the user never stops the work.
 * A day after the question was filed and nobody answered, the goal is woken
 * once with the instruction to take the harmless default — keep every
 * approved route running, send nothing new, and say what was assumed. The
 * question stays open; the work does not wait on it.
 */
const UNANSWERED_QUESTION_HOURS = 24;
const MAX_DEFAULTS_PER_SWEEP = 5;

export async function sweepUnansweredOwnerQuestions(): Promise<number> {
  const waiting = await getGoalsUnansweredForADay(
    UNANSWERED_QUESTION_HOURS,
    MAX_DEFAULTS_PER_SWEEP,
  );
  let taken = 0;
  for (const task of waiting) {
    // Stamped BEFORE the wake, so a failing run cannot fire the default every
    // five minutes; the question is still open and the next wake sees it.
    await markQuestionDefaulted(task.id);
    const question = task.pending_question ?? 'ის კითხვა, რომელიც წინა ჯერზე დაუსვა';
    const woken = await wakeTask(
      task.id,
      `მფლობელმა ერთი დღეა არ უპასუხა კითხვას („${question}"). კითხვა ღიად რჩება, მაგრამ მუშაობა ` +
        'მასზე არ ჩერდება: მიიღე უსაფრთხო, უვნებელი დაშვება, გააგრძელე დამტკიცებული გზები ' +
        '(ახალი არაფერი გაგზავნო გეგმის გარეთ), და მფლობელს ერთი წინადადებით უთხარი რა დაუშვი ' +
        'და რას აკეთებ ამასობაში. ბოლოს — რა მიდის ახლა და როდის დაბრუნდები.',
    );
    if (woken) taken++;
  }
  return taken;
}

/**
 * Line 3 of the standard, in code (Ticket 10 Task 24 (a)): a silent day widens
 * the circle. A goal with a plan whose newest ask has waited a day unanswered,
 * with nothing newer sent, is woken once with the instruction to write to the
 * next people the plan names — several, not one. Stamped before the wake.
 */
const SILENT_DAY_HOURS = 24;
const MAX_SILENT_WAKES_PER_SWEEP = 5;

export async function sweepSilentGoals(): Promise<number> {
  const silent = await getSilentGoals(SILENT_DAY_HOURS, MAX_SILENT_WAKES_PER_SWEEP);
  let woken = 0;
  for (const task of silent) {
    await markSilentDayWoken(task.id);
    const ok = await wakeTask(
      task.id,
      'ერთი დღეა კითხვა უპასუხოდ არის და ახალი არავის მისწერია. სტანდარტის წესია: ჩუმი დღე = ' +
        'მეტ ადამიანს ჰკითხე. გეგმის „ვის ვკითხავ" სიიდან, ვისაც ჯერ არ მისწერია, ახლა მისწერე — ' +
        'რამდენიმეს ერთდროულად, არა თითო-თითოდ. ეს გეგმის ფარგლებშია და ცალკე თანხმობა არ სჭირდება. ' +
        'თუ სიაში ყველას უკვე მისწერე — ეს მეთოდის შეცვლის დროა: propose_task_plan-ით შესთავაზე ' +
        'ახალი წრე ან ახალი გზა. ბოლოს ერთი სტრიქონი: რა მიდის ახლა, ვის ვკითხე, როდის დავბრუნდები.',
    );
    if (ok) woken++;
  }
  return woken;
}

async function nightlyReview(): Promise<void> {
  const stale = await getStaleOpenTasks(NIGHTLY_REVIEW_QUIET_HOURS, MAX_NIGHTLY_REVIEWS);
  for (const task of stale) {
    await touchTaskActivity(task.id); // one review per night even if the run fails
    await wakeTask(
      task.id,
      'ღამის გადახედვა: ქსელში გუშინდელის მერე ახალი ხალხი/ინფორმაცია შეიძლება გაჩნდა. ' +
        'გაიმეორე ძირითადი ძიებები და შეადარე brief-ს — მფლობელს მხოლოდ რეალური სიახლე აცნობე; ' +
        'თუ არაფერია, ჩუმად განაახლე brief-ი და საჭიროებისას set_task_wake-ით გადადე. ' +
        // The standard, lines 3 and 4 (D117, D119): a silent day widens the
        // circle inside the plan; three silent days change the method — a
        // plan change, so a new yes, while the rest keeps running.
        'თუ გუშინდელი კითხვა უპასუხოდ დარჩა — არ დაელოდე: გეგმის „ვის ვკითხავ" სიიდან შემდეგ ' +
        'ადამიანებს მისწერე (რამდენიმეს ერთდროულად). თუ სამი დღეა პასუხი არ არის — მეთოდი შეცვალე: ' +
        'propose_task_plan-ით შესთავაზე ახალი გზა ან ახალი წრე; დამტკიცებული გზები კი გრძელდება. ' +
        'ყოველი პასუხი დაასრულე ერთი სტრიქონით: რა მიდის ახლა, ვის ვკითხე, როდის დავბრუნდები. ' +
        'თუ წინსვლა მფლობელის პასუხზეა ჩამოკიდებული — გამოიძახე ask_owner_decision ზუსტი ' +
        'კითხვით: ის კითხვას მფლობელის მომდევნო საუბარში იტანს. ეს მაშინაც გააკეთე, როცა ' +
        'ლოდინს თხრობით ამბობ („ველოდები მის გადაწყვეტილებას ორ კანდიდატზე") — მფლობელისგან ' +
        'რაღაცის ლოდინი ბლოკია, როგორც არ უნდა ჟღერდეს წინადადება.',
    );
    // The review woke it; if the run set no wake, tomorrow's is set here.
    await ensureNextWake(task.id, DEFAULT_NEXT_WAKE_HOURS).catch((err: unknown) =>
      // eslint-disable-next-line no-console
      console.error('[task-engine] default wake failed:', (err as Error).message),
    );
  }
  if (stale.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[task-engine] nightly review woke ${stale.length} task(s)`);
  }
}

/** Monday 06:00 UTC — 10:00 in Tbilisi, the start of the working week. */
const WEEKLY_SUMMARY_UTC_DAY = 1;
const WEEKLY_SUMMARY_UTC_HOUR = 6;

function msUntilWeeklySummary(): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(WEEKLY_SUMMARY_UTC_HOUR, 0, 0, 0);
  const daysAhead = (WEEKLY_SUMMARY_UTC_DAY - next.getUTCDay() + 7) % 7;
  next.setUTCDate(next.getUTCDate() + daysAhead);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 7);
  return next.getTime() - now.getTime();
}

function msUntilUtcHour(hour: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(hour, 30, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

export function startTaskTicker(): void {
  setInterval(() => {
    void tick().catch((err) =>
      // eslint-disable-next-line no-console
      console.error('[task-engine] tick failed:', (err as Error).message),
    );
  }, TICK_INTERVAL_MS).unref();

  setInterval(() => {
    void sendDueAskReminders(MAX_REMINDERS_PER_SWEEP).catch((err) =>
      // eslint-disable-next-line no-console
      console.error('[task-engine] reminder sweep failed:', (err as Error).message),
    );
    void sweepSilentGoals()
      .then((n) => {
        // eslint-disable-next-line no-console
        if (n > 0) console.log(`[task-engine] silent-day widening woke ${n} goal(s)`);
      })
      .catch((err) =>
        // eslint-disable-next-line no-console
        console.error('[task-engine] silent-day sweep failed:', (err as Error).message),
      );
    void sweepMethodChanges()
      .then((n) => {
        // eslint-disable-next-line no-console
        if (n > 0) console.log(`[task-engine] method-change proposal woke ${n} goal(s)`);
      })
      .catch((err) =>
        // eslint-disable-next-line no-console
        console.error('[task-engine] method-change sweep failed:', (err as Error).message),
      );
    // C9.7's timer half: silence IS an outcome — a week-old unanswered intro
    // produces a no_reply row without anyone touching the app.
    void sweepUnansweredIntroOutcomes()
      .then((n) => {
        // eslint-disable-next-line no-console
        if (n > 0) console.log(`[part-h] recorded ${n} no_reply intro outcome(s)`);
      })
      .catch((err) =>
        // eslint-disable-next-line no-console
        console.error('[part-h] no-reply sweep failed:', (err as Error).message),
      );
  }, REMINDER_INTERVAL_MS).unref();

  setInterval(() => {
    void sweepUnwokenAnswers().catch((err) =>
      // eslint-disable-next-line no-console
      console.error('[task-engine] answer-wake sweep failed:', (err as Error).message),
    );
    void sweepUnansweredOwnerQuestions()
      .then((n) => {
        // eslint-disable-next-line no-console
        if (n > 0) console.log(`[task-engine] harmless default taken on ${n} goal(s)`);
      })
      .catch((err) =>
        // eslint-disable-next-line no-console
        console.error('[task-engine] default sweep failed:', (err as Error).message),
      );
  }, UNWOKEN_SWEEP_INTERVAL_MS).unref();

  // Line 5 of the standard (D55, D127): a weekly summary to every user with an
  // open goal, whatever the news. Monday morning, Tbilisi time.
  const scheduleWeekly = (): void => {
    setTimeout(() => {
      void sendWeeklySummaries()
        .then((n) => {
          // eslint-disable-next-line no-console
          console.log(`[task-engine] weekly summaries sent to ${n} user(s)`);
        })
        .catch((err) =>
          // eslint-disable-next-line no-console
          console.error('[task-engine] weekly summary failed:', (err as Error).message),
        )
        .finally(scheduleWeekly);
    }, msUntilWeeklySummary()).unref();
  };
  scheduleWeekly();

  const scheduleNightly = (): void => {
    setTimeout(() => {
      void nightlyReview()
        .catch((err) =>
          // eslint-disable-next-line no-console
          console.error('[task-engine] nightly review failed:', (err as Error).message),
        )
        .finally(scheduleNightly);
    }, msUntilUtcHour(NIGHTLY_REVIEW_HOUR_UTC)).unref();
  };
  scheduleNightly();

  // eslint-disable-next-line no-console
  console.log('[task-engine] ticker started (60s; reminders hourly; nightly review 02:30 UTC)');
}

/** Re-exported for the ask-answer capture path (threads.routes). */
export type { Task };
