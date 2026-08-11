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
} from './taskAsks.service';
import { getThread, saveThreadMessage } from './threads.service';
import { setThreadStatus, endsWithQuestion } from './threadStatus.service';
import { emitRunComplete, emitRunError, hasActiveConnection } from './sse.service';
import { sendPushNotification } from './notification.service';
import { checkRunAllowance } from './tokenWallet.service';
import { scrubText } from './privacyScrub';
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
export async function wakeTask(taskId: number, eventText: string): Promise<boolean> {
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

    const hardTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('RUN_HARD_TIMEOUT')), RUN_HARD_TIMEOUT_MS),
    );
    try {
      const result = await Promise.race([
        processChat(ownerId, thread.id, `[მოვლენა] ${eventText}`, runId),
        hardTimeout,
      ]);
      if (result.runFailed === true) {
        emitRunError(ownerId, thread.id, runId, result.reply);
        void setThreadStatus(ownerId, thread.id, 'failed');
        // The event itself was persisted into the thread before the run died —
        // it is delivered; the task will see it on its next step.
        return true;
      }
      emitRunComplete(ownerId, thread.id, runId, {
        reply: result.reply,
        ...(result.taskResult && { result: result.taskResult }),
      });
      // A task whose question is unanswered on someone else's phone is waiting,
      // not finished (ticket 4 item 0C.5).
      const pendingAsk = await hasPendingAskForThread(thread.id).catch(() => false);
      const status = result.requestCreated
        ? 'waiting'
        : endsWithQuestion(result.reply)
          ? 'needs_you'
          : pendingAsk
            ? 'waiting'
            : 'done';
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
      }
      return true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[task-engine] wake failed for task ${taskId}:`, (err as Error).message);
      emitRunError(ownerId, thread.id, runId, 'დავალების ნაბიჯი ვერ დასრულდა — მოგვიანებით ვცდი.');
      void setThreadStatus(ownerId, thread.id, 'failed');
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
    const woken = await wakeTask(
      ask.task_id,
      buildAnswerWakeEvent(ask.answer ?? '', ask.from_name),
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
        'თუ არაფერია, ჩუმად განაახლე brief-ი და საჭიროებისას set_task_wake-ით გადადე.',
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
