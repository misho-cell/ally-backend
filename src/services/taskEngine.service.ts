import { randomUUID } from 'crypto';
import { processChat } from './chat.service';
import { getTaskById, getDueTasks, clearTaskWake, Task } from './taskStore.service';
import { getThread, saveThreadMessage } from './threads.service';
import { setThreadStatus, endsWithQuestion } from './threadStatus.service';
import { emitRunComplete, emitRunError, hasActiveConnection } from './sse.service';
import { sendPushNotification } from './notification.service';
import { checkRunAllowance } from './tokenWallet.service';
import { scrubText } from './privacyScrub';
import { RUN_HARD_TIMEOUT_MS } from '../config/runBudgets';

const TICK_INTERVAL_MS = 60_000;
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
 */
export async function wakeTask(taskId: number, eventText: string): Promise<void> {
  if (runningTasks.has(taskId)) return;
  runningTasks.add(taskId);
  try {
    const task = await getTaskById(taskId);
    if (!task || task.status !== 'open' || task.thread_id === null) return;
    const ownerId = String(task.user_id);
    const thread = await getThread(task.thread_id, ownerId);
    if (!thread) return;
    if (thread.status === 'working') return; // a live run owns the thread right now

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
      return;
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
        return;
      }
      emitRunComplete(ownerId, thread.id, runId, {
        reply: result.reply,
        ...(result.taskResult && { result: result.taskResult }),
      });
      const status = result.requestCreated
        ? 'waiting'
        : endsWithQuestion(result.reply)
          ? 'needs_you'
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
    }
  } finally {
    runningTasks.delete(taskId);
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

export function startTaskTicker(): void {
  setInterval(() => {
    void tick().catch((err) =>
      // eslint-disable-next-line no-console
      console.error('[task-engine] tick failed:', (err as Error).message),
    );
  }, TICK_INTERVAL_MS).unref();
  // eslint-disable-next-line no-console
  console.log('[task-engine] ticker started (60s)');
}

/** Re-exported for the ask-answer capture path (threads.routes). */
export type { Task };
