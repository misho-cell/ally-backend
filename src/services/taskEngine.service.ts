import { randomUUID } from 'crypto';
import { query } from '../db/postgres/client';
import { DAY_ONE_WAKE, finishWake, recordWake, wakeDoneSince } from './engineWakes.service';
import { processChat } from './chat.service';
import {
  getTaskById,
  goalHasActedOutward,
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
import {
  getThread,
  lastAssistantMessageIs,
  saveThreadMessage,
  threadLanguage,
} from './threads.service';
import { RunLanguage, RUN_STRINGS, answerHeldNoTokens } from './runLanguage';
import { DAY_ONE_EVENT, PLAN_PROPOSAL_EVENT } from './taskEngine.events';
import { setThreadStatus, endsWithQuestion, runStatus } from './threadStatus.service';
import { describeAskBudget, AskBudgetState } from './askBudget.service';
import { markRunFailed } from './runFailure.service';
import { flagGoalNeedsOwner, goalQuestionFlaggedSince } from './goalQuestions.service';
import { emitRunComplete, emitRunError } from './sse.service';
import { sendPushNotification } from './notification.service';
import { checkRunAllowance } from './tokenWallet.service';
import { beginRun, endRun, isDraining } from './inFlightRuns';
import { scrubText } from './privacyScrub';
import { enterThread, leaveThread, threadHolder } from './threadRunQueue';
import { sweepUnansweredIntroOutcomes } from './partH.service';
import { sendWeeklySummaries } from './weeklySummary.service';
import {
  RUN_HARD_TIMEOUT_MS,
  THREAD_QUEUE_BUDGET_MS,
  THREAD_QUEUE_POLL_MS,
} from '../config/runBudgets';

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
 * Ticket 20 row 157 — why a wake did not happen, because „no" was two different
 * answers wearing one word.
 *
 * `wakeWhenFree` retries a wake that returned false, fifteen times, six seconds
 * apart. That is right for a thread that is busy and wrong for everything else,
 * and nothing in a bare `false` could tell them apart. Measured on Ninia's
 * thread 16402, 17 September:
 *
 *   10:37:38, :46, :54, 10:38:03 … 10:39:31   fifteen rows, eight seconds apart
 *   „დავალებაზე მუშაობა შევაჩერე, ტოკენები ამოიწურა."
 *
 * Fifteen attempts, fifteen identical messages on a real person's screen, each
 * one telling her again that her tokens had run out. An empty balance does not
 * refill in six seconds; retrying it was never going to work, and every attempt
 * cost her another line.
 */
export type WakeResult =
  /** The run happened — or died inside it, the event having been delivered. */
  | 'woken'
  /** The thread is occupied right now; asking again shortly may well work. */
  | 'busy'
  /** Nothing to wake, or nothing a retry could change. Stop asking. */
  | 'stopped';

/**
 * Advance a task by one engine-initiated run: the event text enters the task's
 * thread as a normal turn (so history carries it), the run works with tools,
 * and the outcome is delivered exactly like a user-triggered run — SSE,
 * statuses, push when the owner is away.
 *
 * Says whether the event entered the thread, and when it did not, whether
 * asking again could change that. Callers that must guarantee delivery (the
 * answer-wake path) use it to decide whether to mark the wake delivered or
 * leave it for the sweep.
 */
/**
 * An event's text, either fixed or chosen by the conversation's language.
 *
 * A wake knows the task, not the thread, until it is inside wakeTask — so the
 * language cannot be resolved by the caller. The ones that vary are passed as
 * the table and read once the thread is in hand.
 */
export type EventText = string | Readonly<Record<RunLanguage, string>>;

export async function wakeTask(
  taskId: number,
  eventText: EventText,
  // Answer wakes carry the verbatim answer; the run's reply provably quotes it.
  ensureQuoted?: EnsureQuoted,
): Promise<WakeResult> {
  if (runningTasks.has(taskId)) return 'busy';
  /**
   * The server is going away, so a run begun now is a run that will be killed.
   *
   * `isDraining`'s own comment says „read before starting anything" and the
   * user-facing route has read it since row 205 — this path never did, which
   * is how an engine run gets to start inside a shutdown and vanish with it.
   * 'busy' rather than 'stopped', deliberately: a retry is exactly the right
   * thing here, and `sweepUnwokenAnswers` only marks an answer delivered on
   * 'woken', so nothing is consumed by refusing.
   *
   * IT WOULD NOT HAVE SAVED GOAL 6337 AND I AM NOT GOING TO IMPLY IT WOULD.
   * That day-one wake started at 19:24:56 and SIGTERM arrived at 19:24:58 —
   * two seconds before this flag could be true. The deploy that killed it was
   * mine, pushed while the seat was mid-session, and no guard in this file is
   * the answer to that. This closes the twenty-second drain window; the rest
   * is a question about when I am allowed to deploy.
   */
  if (isDraining()) return 'busy';
  runningTasks.add(taskId);
  /**
   * Row 209 — what this wake is holding, so the `finally` can give it back.
   *
   * The guard below has always been one-directional: a wake waits for the
   * owner, and nothing stopped the owner starting a run ON TOP of a wake
   * already in flight (thread 15049, two clarifying questions a second apart).
   * The owner's route now waits for whoever holds the conversation — so a wake
   * that does not hold it is invisible to that wait, and 15049 stays open.
   */
  let holding: { threadId: number; runId: string } | null = null;
  try {
    const task = await getTaskById(taskId);
    if (!task || task.status !== 'open' || task.thread_id === null) return 'stopped';
    const ownerId = String(task.user_id);
    const thread = await getThread(task.thread_id, ownerId);
    if (!thread) return 'stopped';
    if (thread.status === 'working') return 'busy'; // a live run owns the thread right now
    // Row 209: the same question asked of the lock rather than of a status
    // column written with `void`. Refused rather than queued, deliberately —
    // the retry loop above already knows how to come back, and a wake that
    // sat in a queue for two minutes would arrive into a conversation that
    // has moved on. Taken here, immediately after the check, so nothing can
    // slip between the two.
    if (threadHolder(thread.id) !== undefined) return 'busy';
    const wakeRunId = randomUUID();
    await enterThread(thread.id, wakeRunId, THREAD_QUEUE_BUDGET_MS, THREAD_QUEUE_POLL_MS);
    holding = { threadId: thread.id, runId: wakeRunId };
    /**
     * 21 September — AND THE DRAIN HAS TO BE ABLE TO SEE IT.
     *
     * This path read `isDraining()` on the way in and never registered what it
     * then started. `beginRun`/`endRun` were called from `threads.routes.ts`
     * and nowhere else, so `inFlightCount()` counted chat runs only — and an
     * engine run in flight was invisible to the shutdown that killed it.
     *
     * Read from the logs rather than reasoned about. 20 September:
     *
     *   21:42:02.635  run 28e53894, mode task_step, thread 16737, owner 160584
     *   21:42:20.057  [shutdown] SIGTERM: draining, 0 run(s) in flight
     *   21:42:20.057  [shutdown] all runs finished          (4 µs later)
     *   21:43:36.366  [run-reaper] reaped 1 orphaned run(s)
     *
     * The owner was told „ტექნიკური შეფერხება მოხდა". The drain had a
     * twenty-second budget, the run was seventeen seconds old, and the drain
     * spent none of it — because the count was zero and the count was wrong.
     *
     * THE HONEST LIMIT, because the count being right is most of what this
     * buys: an engine run takes sixty to ninety seconds and the budget is
     * twenty, so registering it does not promise to save it. What it ends is
     * a shutdown that reports „0 run(s) in flight" while cutting one in half —
     * the same failure this codebase keeps finding in its own numbers, where
     * „I cannot see any" is printed as „there are none".
     */
    // 22 September: `kind: 'engine'` is load-bearing, not a label. A shutdown
    // that cut this off must NOT write „your answer was cut off" underneath
    // it — nobody asked for a wake, so there is no reply of theirs to have
    // failed. It is logged and left to the reaper.
    beginRun(wakeRunId, { kind: 'engine', userId: Number(ownerId), threadId: thread.id });
    // Ticket 19 G1 and G5: and a thread the owner is still TALKING in is not
    // free either, whatever its status says.
    //
    // Thread 15049, 15 September, from run_prompt_stamps:
    //
    //   12:38:18.172  1fc625af   the owner's first message
    //   12:38:31.235  a313be02   this wake — the thread read as free
    //   12:38:35.155  3eaa2425   the owner's „კი", ON TOP of the running wake
    //   12:38:36 / :37           both of them reply, a second apart, with two
    //                            different clarifying questions
    //
    // The guard was one-directional. A wake waits for the owner; nothing ever
    // stopped the owner from starting a run on top of a wake already in
    // flight, so the status check only ever caught the gap BETWEEN turns —
    // which in a live conversation is exactly where it lands.
    //
    // Giving up is safe here, and that is the point: in a conversation that is
    // still going, the owner's OWN run does this work. On 15049 it did — run
    // 777a139a proposed the plan at 12:38:58, unprompted by any wake. The wake
    // exists for the thread that has gone quiet.
    if (await ownerSpokeRecently(thread.id)) return 'busy';

    // Engine runs spend the owner's tokens like any other run — an exhausted
    // balance pauses the task visibly instead of failing silently.
    const allowance = await checkRunAllowance(ownerId);
    if (!allowance.allowed) {
      // Row 157, the second half. 'stopped' already keeps `wakeWhenFree` from
      // asking again, but the line must be said once even when a DIFFERENT
      // path arrives at an empty balance — a second goal on the same thread,
      // the hourly sweep, the ticker. The thread's own status line is the
      // record that it was already said, so no extra read is needed for it.
      //
      // In the thread's own language, which it was not: this was the one place
      // that still wrote a fixed Georgian sentence into an English
      // conversation, and it wrote it at the worst moment there is — the
      // moment the owner is told their work has stopped and asked for money.
      const language = await threadLanguage(thread.id).catch(() => 'ka' as RunLanguage);
      await setThreadStatus(ownerId, thread.id, 'needs_you', {
        statusLine: RUN_STRINGS[language].statusLines.needs_topup,
      });
      /**
       * WHEN THE REFUSED WAKE WAS CARRYING NEWS, SAY WHOSE.
       *
       * Goal 6205: the owner asked for an introduction, two people helped, the
       * target accepted and offered his week — and the wake that would have
       * told him arrived at 19:10:21, found an empty wallet, and was answered
       * with „work is paused, top up". The only thing the product has ever
       * said to him about work that succeeded is that he owes money. Neither
       * row 157 nor row 210 would have caught it: each is correct alone, and
       * this is what they do to each other.
       *
       * Nothing is lost — `sweepUnwokenAnswers` marks an ask delivered only on
       * 'woken', so the answer is re-offered every sweep and arrives whole
       * once there is an allowance. „Held" and „nothing happened" are
       * different facts and the person is owed the first.
       */
      const who = ensureQuoted?.who?.trim();
      const line =
        who === undefined || who === ''
          ? RUN_STRINGS[language].goalPausedNoTokens
          : answerHeldNoTokens(language, who);
      /**
       * Not said twice, and the test of that is the LINE rather than the
       * status badge.
       *
       * The badge could only ever answer „has this thread been told about the
       * wallet", so a generic pause said first would have swallowed the news
       * that came after it — and the sweep retries every tick, which would
       * otherwise repeat whichever line came first. Comparing the exact line
       * against the thread's last assistant message answers the question that
       * is actually being asked: has this person already been told THIS.
       */
      if (!(await lastAssistantMessageIs(thread.id, line))) {
        await saveThreadMessage(thread.id, Number(ownerId), 'assistant', line).catch(
          () => undefined,
        );
      }
      return 'stopped';
    }

    // Row 209: the id the thread lock was taken with, so the log and the lock
    // name the same run.
    const runId = wakeRunId;
    void setThreadStatus(ownerId, thread.id, 'working');
    // A wake that proposes something the tool will refuse wastes the run and
    // hands the owner a promise nobody can keep (ticket 9 task 17: four goals
    // woke every night offering asks while the account's budget was zero). The
    // event carries the state of the budget, so the plan is made knowing it.
    /**
     * The event in the conversation's language — resolved HERE because this is
     * the first point that knows the thread.
     *
     * The seat's three-thread read: an English conversation stayed English
     * until one of these arrived in Georgian, and switched on the very next
     * message. The events are stored with role „user", so to the model this is
     * the owner writing five hundred Georgian characters, and answering in the
     * owner's language is exactly what it was told to do.
     *
     * The owner's own messages decide, never the assistant's — same rule, same
     * function, as every other fixed string. A thread whose language cannot be
     * read falls back to Georgian, which is what the text always was.
     */
    const language = await threadLanguage(thread.id).catch(() => 'ka' as RunLanguage);
    const eventBody = typeof eventText === 'string' ? eventText : eventText[language];

    const budgetNote = outreachNoteFor(
      await describeAskBudget(ownerId).catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[task-engine] budget read failed:', (err as Error).message);
        return null;
      }),
    );

    /**
     * A FLOOR UNDER THE RUN, ARMED BEFORE IT RATHER THAN AFTER IT.
     *
     * The seat's narrow question on 19 September was the right one: what is
     * supposed to happen when the send step fails after a plan is approved?
     * The answer was nothing. Goal 6337's day-one wake was killed mid-run by a
     * deploy, and every path that would have rescued it runs AFTER the wake —
     * the ticker's `ensureNextWake`, `startDayOne`'s own `onDone`. A run that
     * dies never reaches its own safety net. So the goal sat with
     * `next_wake_at: null`, zero asks, a stage of `running`, and a message on
     * the owner's screen saying two people had been asked.
     *
     * AND THE NIGHTLY SWEEP WOULD NOT HAVE SAVED IT EITHER, which I told the
     * seat it would and was wrong about. `getStaleOpenTasks` wants twenty
     * hours of quiet as well as a null wake, and that goal had been touched
     * minutes before — so the first sweep that could see it is not tonight's
     * but tomorrow's, thirty-one hours later, and any activity in the thread
     * pushes it out again.
     *
     * `ensureNextWake` only fills a NULL, so this cannot shorten a wake the
     * model chose, and a `set_task_wake` inside the run overwrites it. The
     * ticker's call after the run becomes a no-op, which is the correct shape:
     * the floor belongs before the thing that can die, not after it.
     */
    await ensureNextWake(taskId, DEFAULT_NEXT_WAKE_HOURS).catch((err: unknown) =>
      // eslint-disable-next-line no-console
      console.error('[task-engine] could not arm the pre-run wake floor:', (err as Error).message),
    );

    const hardTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('RUN_HARD_TIMEOUT')), RUN_HARD_TIMEOUT_MS),
    );
    const runStartedAt = new Date();
    try {
      const result = await Promise.race([
        processChat(ownerId, thread.id, `[მოვლენა] ${eventBody}${budgetNote}`, runId, ensureQuoted),
        hardTimeout,
      ]);
      if (result.runFailed === true) {
        emitRunError(ownerId, thread.id, runId, result.reply);
        void markRunFailed(ownerId, thread.id, result.language ?? 'ka');
        // The event itself was persisted into the thread before the run died —
        // it is delivered; the task will see it on its next step.
        return 'woken';
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
      //
      // A FAILED CHECK IS NOT A NO. This used to catch into `false`, which sent
      // the goal to „done" — so a database hiccup while asking „is somebody
      // still to answer" was rendered as „nobody is", on the badge the owner
      // reads to know whether the thing is finished. That is the same
      // substitution the product made when it said a note was deleted and it
      // was not: an error wearing the clothes of a confident answer.
      //
      // Unknown is therefore its own value and it counts as waiting. „Waiting"
      // claims only that something may still be out there, which is true when
      // we cannot tell; „done" claims nothing is, which we do not know.
      const pendingAsk = await hasPendingAskForThread(thread.id).catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[task-engine] pending-ask check failed:', (err as Error).message);
        return 'unknown' as const;
      });
      const status = runStatus({
        asksOwner,
        requestCreated: result.requestCreated === true,
        pendingAsk,
      });
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
      // Sent unconditionally: whether the person is away is decided per DEVICE
      // inside sendPushNotification, and this gate — one boolean for a person
      // with four devices — is exactly what silenced Lika's phone (row 6).
      const preview = scrubText(result.reply).replace(/\s+/g, ' ').trim();
      void sendPushNotification(ownerId, {
        // The conversation's own language, read at the top of this function.
        // The PREVIEW is the reply itself and is already in it; the chrome
        // around it was Georgian on every lock screen in the world.
        title: RUN_STRINGS[language].goalNewsPush.title,
        body:
          preview.length > PUSH_PREVIEW_MAX_CHARS
            ? preview.slice(0, PUSH_PREVIEW_MAX_CHARS - 1).trimEnd() + '…'
            : preview || RUN_STRINGS[language].goalNewsPush.body,
        url: `/chat/${thread.id}`,
      }).catch(() => undefined);
      return 'woken';
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[task-engine] wake failed for task ${taskId}:`, (err as Error).message);
      emitRunError(ownerId, thread.id, runId, RUN_STRINGS[language].stepFailedWillRetry);
      void markRunFailed(ownerId, thread.id);
      await saveThreadMessage(
        thread.id,
        Number(ownerId),
        'assistant',
        RUN_STRINGS[language].stepFailedWillRetry,
        'error',
        // Row 202: the run that died, so the failure can be joined to it.
        runId,
      ).catch(() => undefined);
      // 'stopped', not 'busy', and row 157 is the reason: this branch has just
      // written „მოგვიანებით თავად ვცდი ხელახლა" to the thread. Retrying it
      // fifteen times would write that line fifteen times, which is the bug
      // being fixed one branch up. The promise it makes is kept by the minute
      // ticker, not by hammering a crash six seconds later.
      return 'stopped';
    }
  } finally {
    runningTasks.delete(taskId);
    // Row 209: and let the conversation go, whichever way this ended. A wake
    // that returned 'stopped' on an empty wallet still took the lock.
    if (holding !== null) {
      endRun(holding.runId);
      leaveThread(holding.threadId, holding.runId);
    }
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
    if (woken === 'woken') {
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
// Long enough to sit out an ordinary exchange rather than barge into the gap
// between two of the owner's messages: 15 attempts at 6s is about 90 seconds,
// against the 32 it was. A wake that still cannot get in gives up in the log —
// and in a conversation that busy the owner's own run is doing the work.
const WAKE_RETRY_DELAY_MS = 6_000;
const WAKE_RETRY_ATTEMPTS = 15;

/**
 * How long after an approval day one may still be coming.
 *
 * Ticket 20 row 209. A second run that approves the same plan must be told
 * „day one is already on its way" rather than start it again — but that
 * sentence has to be TRUE when written, which is the same rule that took the
 * word „today" out of the ask refusals. So it is derived from the schedule
 * above instead of guessed: the delay before the first attempt, plus every
 * retry the wake is allowed, plus one whole run for the wake that finally gets
 * in. After that, day one has either happened or given up in the log, and a
 * caller is told the plain truth that the plan has been in force for a while.
 */
export const DAY_ONE_WINDOW_MS =
  DAY_ONE_DELAY_MS + WAKE_RETRY_ATTEMPTS * WAKE_RETRY_DELAY_MS + RUN_HARD_TIMEOUT_MS;

/**
 * Has the owner said something themselves in the last few seconds?
 *
 * `kind = 'message'` on purpose: an engine EVENT is stored as a user row too,
 * and counting those would let wakes block each other for ever.
 */
const OWNER_QUIET_MS = 25_000;
const OWNER_QUIET_QUERY_TIMEOUT_MS = 4_000;

export async function ownerSpokeRecently(
  threadId: number,
  withinMs: number = OWNER_QUIET_MS,
): Promise<boolean> {
  try {
    const result = await query<{ recent: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM conversations
         WHERE thread_id = $1 AND role = 'user' AND kind = 'message'
           AND content <> ''
           AND created_at > NOW() - ($2 || ' milliseconds')::interval
       ) AS recent`,
      [threadId, withinMs],
      OWNER_QUIET_QUERY_TIMEOUT_MS,
    );
    return result.rows[0]?.recent === true;
  } catch (err) {
    // Unreadable means unknown, and unknown means wait: talking over the owner
    // is the failure this exists to prevent, so it is the one we refuse to
    // risk. The wake retries, and gives up loudly if it never gets a turn.
    // eslint-disable-next-line no-console
    console.warn(
      '[task-engine] owner-quiet check failed, treating as busy:',
      (err as Error).message,
    );
    return true;
  }
}

/**
 * Wake a goal as soon as its thread is free: the first attempt after `delayMs`,
 * then every WAKE_RETRY_DELAY_MS until wakeTask enters the thread or the
 * attempts run out. `stillWanted` is re-read before every attempt so a goal
 * that closed, or already got what the wake would bring, is left alone.
 *
 * THE FLOOR IS WRITTEN BEFORE THE TIMER, and goal 6337 is why.
 *
 * Test 1, 19 September. The plan was approved at 19:24:36, permission granted
 * four seconds later, and `startDayOne` queued the turn that writes to the
 * plan's people. My own deploy's SIGTERM reached that container at 19:24:58,
 * two seconds after the wake began. Fifteen hours later: zero asks, and
 * `next_wake_at` NULL.
 *
 * NOT „NEVER", AND I SAID NEVER. The nightly sweep does read exactly this
 * shape — `getStaleOpenTasks` selects `next_wake_at IS NULL` — but it also
 * wants twenty hours of quiet, and that goal had been touched minutes before,
 * so the first sweep that can see it is not the next night's but the one
 * after: thirty-one hours late, and pushed out again by any activity in the
 * thread. That is the true number and it is bad enough without rounding it to
 * infinity. It is written above `wakeTask`'s own floor too, from the first
 * time I worked this out — I re-derived the goal this morning without reading
 * it and reached for the bigger word.
 *
 * What this floor adds is the paths the one inside `wakeTask` cannot reach:
 * day one, the plan proposal and the introduction outcome all die BEFORE
 * `wakeTask`, so they never arrive at its floor.
 *
 * Everything above this line is a `setTimeout` and nothing else. The database
 * learns that a wake is owed only inside `onWoken`, which runs on exactly one
 * of the four ways out:
 *
 *   woken       -> onWoken runs, the floor is written
 *   not wanted  -> returns
 *   'stopped'   -> returns
 *   out of retries -> returns
 *
 * and a fifth that reaches no branch at all: THE PROCESS DIES. A deploy
 * between the approval and the wake takes the timer with it, and nothing on
 * disk says anything was owed within the day.
 *
 * So the floor is written here, first, before anything that can be lost. It
 * only fills a NULL (`ensureNextWake`), so it can never shorten a wake a run
 * chooses for itself; all it promises is that an open goal is picked up within
 * a day instead of on the sweep's own terms.
 */
function wakeWhenFree(
  taskId: number,
  eventText: EventText,
  stillWanted: () => Promise<boolean>,
  onWoken: () => Promise<void>,
  delayMs: number,
  attempt = 1,
  /**
   * Rows 231/239: called on the ways out that are NOT „woken" and are not
   * worth retrying, so a durable record of the wake can be closed. Optional —
   * the callers that keep no record pass nothing and behave as before.
   */
  onGaveUp?: () => Promise<void>,
): void {
  if (attempt === 1) {
    void ensureNextWake(taskId, DEFAULT_NEXT_WAKE_HOURS).catch((err: unknown) =>
      // eslint-disable-next-line no-console
      console.error(
        `[task-engine] task ${taskId}: could not write the wake floor before the timer:`,
        (err as Error).message,
      ),
    );
  }
  setTimeout(() => {
    void stillWanted()
      .then(async (wanted) => {
        if (!wanted) return;
        const woken = await wakeTask(taskId, eventText);
        if (woken === 'woken') {
          await onWoken();
          return;
        }
        // Row 157: only a BUSY thread is worth asking again. 'stopped' means
        // nothing a retry could change — an empty wallet, a closed goal, a run
        // that crashed and already said so — and retrying it is how fifteen
        // identical lines reached Ninia's screen in two minutes.
        if (woken === 'stopped') {
          // eslint-disable-next-line no-console
          console.log(`[task-engine] task ${taskId}: wake gave up, nothing a retry would change`);
          if (onGaveUp) await onGaveUp();
          return;
        }
        if (attempt < WAKE_RETRY_ATTEMPTS) {
          wakeWhenFree(
            taskId,
            eventText,
            stillWanted,
            onWoken,
            WAKE_RETRY_DELAY_MS,
            attempt + 1,
            onGaveUp,
          );
        } else {
          // eslint-disable-next-line no-console
          console.error(
            `[task-engine] task ${taskId}: thread still busy after ${attempt} attempts`,
          );
          // Left OPEN on purpose: a thread too busy for ninety seconds is
          // exactly the case the sweeper should try again, later, when it is
          // not. `attempts` on the row is what stops that going on for ever.
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

/**
 * Rows 231 and 239 — day one is written down before the timer starts.
 *
 * The timer is unchanged and is still the fast path: 30 of the last 41
 * approvals got their first day in 7-67 seconds through it. The row is the net
 * under the other eleven, which lost their timer to a restart and waited for
 * the day-long floor while the product told them it had already started.
 *
 * `delayMs` is a parameter only so the sweeper can re-run the same wake with
 * no delay. Nothing else passes it.
 *
 * `queuedAt` is read here, at the top, because it is what the guard below
 * compares against: „did somebody else finish this wake after I was queued".
 * The timer and the sweeper can BOTH be queued for one wake — the claim does
 * not stop that, whatever the table's own comment used to say — and this is the
 * only thing that keeps the second one from writing day one twice.
 */
export function startDayOne(taskId: number, delayMs: number = DAY_ONE_DELAY_MS): void {
  const queuedAt = new Date();
  void recordWake(taskId, DAY_ONE_WAKE, delayMs);
  wakeWhenFree(
    taskId,
    DAY_ONE_EVENT,
    async () => {
      // Asked before the goal's own state, because a wake already run is not
      // owed however open the goal is. This is the sweeper standing down when
      // the timer's run finished underneath its retry loop — and the timer
      // standing down in the mirror case.
      if (await wakeDoneSince(taskId, DAY_ONE_WAKE, queuedAt)) {
        // eslint-disable-next-line no-console
        console.log(`[task-engine] task ${taskId}: day one already ran, standing down`);
        return false;
      }
      const open = await goalOpen(taskId);
      // A closed goal will never want its first day. Taking it off the list
      // here and not only on the woken path is what stops the sweeper picking
      // the same dead goal up five times.
      if (!open) await finishWake(taskId, DAY_ONE_WAKE);
      return open;
    },
    async () => {
      await ensureNextWake(taskId, DEFAULT_NEXT_WAKE_HOURS);
      await finishWake(taskId, DAY_ONE_WAKE);
    },
    delayMs,
    1,
    () => finishWake(taskId, DAY_ONE_WAKE),
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
// Ticket 20 row 117. „ვის ვკითხავთ სახელებით" was an unconditional
// instruction, so on the three „არავის არ მისწერო" goals of 16 September
// (3532, 3535, 3536) every first plan came back naming two to four people —
// and a yes would have written to them. The prompt team's own rule had to
// argue with this line and with propose_task_plan's text to win, which is not
// a fair fight: a model reads a server instruction as a fact about the job.

/**
 * „Is a plan still missing" was the wrong question, and the seat's 391 caught
 * it with a timestamp: goal 7063 sent its introduction at 12:17:21, the
 * mediator accepted at 12:18:15, and at 12:18:25 this timer — queued at
 * 12:16:57 and retried the whole time because the thread was busy DOING the
 * work — woke the run to propose a plan. The plan it proposed was „solved
 * when: Netai Test 2 responds to the introduction request", nine seconds after
 * they had responded, with an I approve button under it.
 *
 * The model was not wrong to propose one. A server wake that says „propose a
 * plan" reads as a fact about the job, which is the same asymmetry row 117
 * records two comments above.
 *
 * So the predicate now asks what it always meant: is there still something to
 * plan. A goal that has already reached somebody has answered that itself. It
 * gates ONLY this timer — the model's own propose_task_plan is untouched, and
 * so are the two long-gap proposals (eight days, one day) that a later round
 * legitimately produced.
 */
export async function nothingToPlanYet(taskId: number): Promise<boolean> {
  const task = await getTaskById(taskId);
  if (!task || task.status !== 'open') return false;
  if (task.plan !== null || task.plan_proposed !== null) return false;
  return !(await goalHasActedOutward(taskId));
}

/**
 * Ticket 20 row 210 — the introduction's answer reaches the goal it was asked
 * for, without the owner having to ask.
 *
 * The same shape as day one and the plan proposal: wake when the conversation
 * is free, leave a goal that has meanwhile closed alone. The delay is longer
 * than theirs because the resolve is still writing the two request threads as
 * this is called, and the run should read a settled world.
 */
const INTRO_OUTCOME_DELAY_MS = 6_000;

export function startIntroOutcome(taskId: number, eventText: EventText): void {
  wakeWhenFree(
    taskId,
    eventText,
    () => goalOpen(taskId),
    () => Promise.resolve(),
    INTRO_OUTCOME_DELAY_MS,
  );
}

export function startPlanProposal(taskId: number): void {
  wakeWhenFree(
    taskId,
    PLAN_PROPOSAL_EVENT,
    () => nothingToPlanYet(taskId),
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
    if (ok === 'woken') woken++;
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
    if (woken === 'woken') taken++;
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
    if (ok === 'woken') woken++;
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
