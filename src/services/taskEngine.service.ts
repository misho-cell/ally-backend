import { randomUUID } from 'crypto';
import { processChat } from './chat.service';
import {
  getTaskById,
  getDueTasks,
  getStaleOpenTasks,
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
  if (budget === null || budget.remaining_this_month > 0) return '';
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
  }
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
        'თუ წინსვლა მფლობელის პასუხზეა ჩამოკიდებული — გამოიძახე ask_owner_decision ზუსტი ' +
        'კითხვით: ის კითხვას მფლობელის მომდევნო საუბარში იტანს. ეს მაშინაც გააკეთე, როცა ' +
        'ლოდინს თხრობით ამბობ („ველოდები მის გადაწყვეტილებას ორ კანდიდატზე") — მფლობელისგან ' +
        'რაღაცის ლოდინი ბლოკია, როგორც არ უნდა ჟღერდეს წინადადება.',
    );
  }
  if (stale.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[task-engine] nightly review woke ${stale.length} task(s)`);
  }
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
  }, UNWOKEN_SWEEP_INTERVAL_MS).unref();

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
