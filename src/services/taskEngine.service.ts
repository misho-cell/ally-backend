import { membersJoinedSinceLastRun, newMembersNote } from './newMembersSince.service';
import { randomUUID } from 'crypto';
import { releaseDueHeldAsks } from './heldAsks.service';
import {
  HeldAskOutcome,
  heldAsksSentNote,
  isStillHeldByTheLimit,
  sendReleasedHeldAsks,
} from './heldAskSend.service';
import { doNotRepeatNote, lastAssistantMessage } from './lastReplyNote';
import { query } from '../db/postgres/client';
import {
  claimSweep,
  SWEEP_ASK_EXPIRY,
  SWEEP_ASK_REMINDERS,
  SWEEP_METHOD_CHANGES,
  SWEEP_SILENT_GOALS,
} from './sweepClaim';
import { claimExpiredAsksToTell, expireSilentAsks, expiredAsksNote } from './askExpiry.service';
import { widenWaveOnSilence } from './askWaves.service';
import {
  DAY_ONE_WAKE,
  finishWake,
  INTRO_OUTCOME_WAKE,
  recordWake,
  wakeDoneSince,
} from './engineWakes.service';
import { offersTheFinishCard, processChat } from './chat.service';
import {
  getTaskById,
  goalHasActedOutward,
  getDueTasks,
  getStaleOpenTasks,
  getGoalsUnansweredForADay,
  markQuestionDefaulted,
  getSilentGoals,
  markSilentDayWoken,
  unmarkSilentDayWoken,
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
  ArrivedAnswer,
  buildAnswersWakeEvent,
  buildShownAnswersWakeEvent,
  guaranteesOf,
  hasPendingAskForThread,
  listUnwokenAnswersForTask,
  QuoteGuarantee,
  UnwokenAnswer,
} from './taskAsks.service';
import { showAnswersToOwner } from './answerCard.service';
import {
  getThread,
  lastAssistantMessageIs,
  saveThreadMessage,
  threadLanguage,
} from './threads.service';
import {
  RunLanguage,
  RUN_STRINGS,
  answerHeldNoTokens,
  isFreeAnswerLine,
  tokensComeBack,
} from './runLanguage';
import { nextRenewalDay } from './renewalDay';
import {
  DAY_ONE_EVENT,
  DAY_ONE_FIRST_PEOPLE,
  INSTRUCTION_EVENT,
  PLAN_FROM_FINDINGS_EVENT,
  PLAN_PROPOSAL_EVENT,
} from './taskEngine.events';
import { RULE_268_QUIET_DAY_ONE, RULE_268_QUIET_DAY_THREE } from './testerRules';
import { setThreadStatus, endsWithQuestion, runStatus, wakeIsNews } from './threadStatus.service';
import { describeAskBudget, AskBudgetState } from './askBudget.service';
import { flagGoalNeedsOwner, goalQuestionFlaggedSince } from './goalQuestions.service';
import { emitRunComplete } from './sse.service';
import { sendPushNotification } from './notification.service';
import { checkRunAllowance } from './tokenWallet.service';
import { beginRun, endRun, isDraining } from './inFlightRuns';
import { scrubText } from './privacyScrub';
import { enterThread, leaveThread, threadHolder } from './threadRunQueue';
import { looksLikeContactInstruction } from './goalIntent';
import { messageNamesOwnContact } from './tools/nameMatch';
import { sweepUnansweredIntroOutcomes } from './partH.service';
import { sendWeeklySummaries } from './weeklySummary.service';
import {
  RUN_HARD_TIMEOUT_MS,
  THREAD_QUEUE_BUDGET_MS,
  THREAD_QUEUE_POLL_MS,
} from '../config/runBudgets';

const TICK_INTERVAL_MS = 60_000;
const REMINDER_INTERVAL_MINUTES = 60;
const REMINDER_INTERVAL_MS = REMINDER_INTERVAL_MINUTES * 60_000;
/** Long enough for the pool and migrations to settle, short enough to matter. */
const BOOT_SWEEP_DELAY_MS = 45_000;
/**
 * ⚠️ THE CLAIM WINDOW IS SHORTER THAN THE TIMER, AND IT HAS TO BE.
 *
 * The timer runs from BOOT. The boot sweep runs at boot + 45 s and is what
 * actually claims the slot, so the slot's clock sits 45 seconds AHEAD of the
 * timer's. An hourly window then refuses the tick at boot + 60 min for being
 * 45 seconds early — and because the refusal leaves the slot untouched, the
 * next tick an hour later is the first that passes. **Hourly work runs every
 * two hours**, and nothing anywhere reports an error.
 *
 * Measured, not reasoned: the slot was claimed 16:53:13 and 17:54:37 — 61
 * minutes apart, because a deploy happened to boot in between and its boot
 * sweep claimed. On a container that simply keeps running, the same phase
 * makes it two hours.
 *
 * Five minutes of slack is enough for any tick to land inside its own hour,
 * and far too little for two ticks of the same hour to both claim.
 */
const CLAIM_WINDOW_MINUTES = REMINDER_INTERVAL_MINUTES - 5;
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
  ensureQuoted?: QuoteGuarantee,
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
      const who = guaranteesOf(ensureQuoted)[0]?.who?.trim();
      const pauseLine =
        who === undefined || who === ''
          ? RUN_STRINGS[language].goalPausedNoTokens
          : answerHeldNoTokens(language, who);
      const line = `${pauseLine} ${tokensComeBack(language, nextRenewalDay(language))}`;
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
      // 37621: the plain pause repeats a free answer's token line said a moment ago;
      // a line that carries someone's news is still said.
      const alsoTold =
        pauseLine === RUN_STRINGS[language].goalPausedNoTokens ? isFreeAnswerLine : undefined;
      if (!(await lastAssistantMessageIs(thread.id, line, alsoTold))) {
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
        // 4 October 02:32Z, thread 31510: a night re-check that came back blank
        // is not the owner's failure — they asked nothing. The goal keeps its
        // status and the screen shows nothing; the log is where we read it.
        // The event itself was persisted into the thread before the run ended —
        // it is delivered; the task will see it on its next step.
        // eslint-disable-next-line no-console
        console.error(
          `[engine] run ${runId} thread ${thread.id}: blank system run, owner not told`,
        );
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
      // Board #386: a quiet run wrote nothing, so there is no news to ring for.
      if (result.quiet === true) return 'woken';
      // #1255: a step of the work is not news; its line stays in the chat.
      if (!wakeIsNews(status, ensureQuoted !== undefined)) {
        // The tester's 39207: a seat has no push subscription, so a skipped push
        // left no trace anywhere. This line is the trace.
        // eslint-disable-next-line no-console
        console.log(`[push] goal ${taskId}: a step (status ${status}) — no push`);
        return 'woken';
      }
      // Not gated on presence: whether the person is away is decided per DEVICE
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
      /*
       * 4 October 10:03Z, thread 14919 (a real owner): the model was overloaded
       * on a scheduled wake, and „the task step did not finish, I'll try again
       * later" landed in her conversation — 51 such rows in seven days. A system
       * run's failure is ours to read in the log (dd38f49): the owner asked
       * nothing, the minute ticker retries, and the goal keeps its status.
       * The badge goes back to what it was: a thread left „working" would be
       * read as a live run and the ticker would never wake it again.
       */
      await setThreadStatus(ownerId, thread.id, thread.status, {
        statusLine: thread.status_line,
      });
      // 'stopped', not 'busy' (row 157): the minute ticker retries, not a
      // crash loop six seconds later.
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

/** The most answers one wake carries; the rest follow in the next. */
const MAX_ANSWERS_PER_WAKE = 10;

/**
 * Row 322: every answer a goal is still owed, in ONE wake. Returns how many
 * were delivered — 0 when there was nothing, or the thread was busy (they stay
 * unmarked, so a retry or the sweep picks them up whole).
 */
/**
 * ⚠️ ROW 322, SECOND PASS — THE SAME BATCH WENT OUT TWICE (seat's 856).
 *
 * Goal 11221, 30 Sep: the batched event reached the owner at 07:34:49 and
 * again, byte-identical, at 07:34:55 — six seconds later, one retry tick. The
 * wake's lock (`runningTasks`) is released in wakeTask's `finally`, BEFORE this
 * function writes the delivered marks, so the next timer found the thread free
 * and the answers still unmarked, and delivered them again.
 *
 * So the goal is held here from the read until the marks are written. A timer
 * that meets it backs off and comes back, and by then finds nothing owed.
 */
const deliveringAnswersFor = new Set<number>();

async function deliverPendingAnswers(taskId: number): Promise<number> {
  if (deliveringAnswersFor.has(taskId)) return 0;
  deliveringAnswersFor.add(taskId);
  try {
    return await deliverOwedAnswers(taskId);
  } finally {
    deliveringAnswersFor.delete(taskId);
  }
}

const BUSY_THREAD_QUERY_TIMEOUT_MS = 4_000;

/**
 * The tester's 1159 (38975): an automatic answer arrives inside the asker's own
 * run — the rule answers while ask_contact is still being called — and its
 * card went on screen at 07:03:59, before the run's „I asked Netai Test 55…"
 * at 07:04:06. The owner read the answer before being told the question went.
 * So the card waits while the goal's conversation is still answering, and
 * the retry (every 6 s, then the 5-minute sweep) shows it after.
 */
export async function conversationIsBusy(
  taskId: number,
  threadId: number | null,
): Promise<boolean> {
  if (runningTasks.has(taskId)) return true;
  if (threadId === null) return false;
  const result = await query<{ status: string }>(
    `SELECT status FROM threads WHERE id = $1 LIMIT 1`,
    [threadId],
    BUSY_THREAD_QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.status === 'working';
}

async function deliverOwedAnswers(taskId: number): Promise<number> {
  const owed = await listUnwokenAnswersForTask(taskId, MAX_ANSWERS_PER_WAKE);
  if (owed.length === 0) return 0;
  if (await conversationIsBusy(taskId, owed[0].task_thread_id)) return 0;
  const arrived = await Promise.all(
    owed.map(async (ask) => ({
      answer: ask.answer ?? '',
      fromName: ask.from_name,
      // D648: an answer is the helper's meaning in the assistant's words, never a quotation.
      verbatim: false,
      passedOn: ask.passed_on === true,
    })),
  );
  // Row 322(a): on the owner's screen first; the model's turn comes after.
  const woken = (await answersAreOnScreen(owed, arrived))
    ? await wakeTask(taskId, buildShownAnswersWakeEvent(arrived))
    : await wakeTask(
        taskId,
        buildAnswersWakeEvent(arrived),
        arrived.map((a) => ({ text: a.answer, who: a.fromName, verbatim: a.verbatim })),
      );
  if (woken !== 'woken') return 0;
  for (const ask of owed) await markAskWakeDelivered(ask.id);
  return owed.length;
}

/**
 * Row 322(a): the card for every owed answer not yet shown. False when it
 * could not be written — then the reply itself must carry them, as before.
 */
async function answersAreOnScreen(
  owed: readonly UnwokenAnswer[],
  arrived: readonly ArrivedAnswer[],
): Promise<boolean> {
  const threadId = owed[0].task_thread_id;
  const ownerId = Number(owed[0].owner_user_id);
  if (threadId === null || !Number.isInteger(ownerId) || ownerId <= 0) return false;
  const unshown = owed
    .map((ask, i) => ({ ask, arrived: arrived[i] }))
    .filter(({ ask }) => ask.shown !== true)
    .map(({ ask, arrived: a }) => ({
      askId: ask.id,
      answer: a.answer,
      fromName: a.fromName,
      verbatim: a.verbatim,
    }));
  return showAnswersToOwner({ threadId, ownerId }, unshown);
}

/**
 * Row 311 — answers to a goal that is no longer open: shown to the owner as an
 * answers card and marked delivered, with no model run (there is no goal to
 * continue). A goal with no thread, or a card that cannot be written, is
 * marked delivered as before, so the sweep cannot loop on it.
 */
async function showClosedGoalAnswers(taskId: number): Promise<void> {
  const owed = await listUnwokenAnswersForTask(taskId, MAX_ANSWERS_PER_WAKE);
  if (owed.length === 0) return;
  const unshown = owed.filter((ask) => ask.shown !== true);
  const threadId = owed[0].task_thread_id;
  const ownerId = Number(owed[0].owner_user_id);
  if (unshown.length > 0 && threadId !== null && Number.isInteger(ownerId) && ownerId > 0) {
    const cards = await Promise.all(
      unshown.map(async (ask) => ({
        askId: ask.id,
        answer: ask.answer ?? '',
        fromName: ask.from_name,
        // D648: an answer is the helper's meaning in the assistant's words, never a quotation.
        verbatim: false,
      })),
    );
    await showAnswersToOwner({ threadId, ownerId }, cards);
  }
  for (const ask of owed) await markAskWakeDelivered(ask.id);
}

/**
 * Row 322: an answer whose live wake found the thread busy — almost always the
 * wake of the answer that came a second before it. Retried on the same
 * six-second rhythm as every other wake; each attempt re-reads what is owed,
 * so five answers that all land here produce one run, and the four timers
 * behind it find nothing left and stop.
 */
export function deliverAnswersWhenFree(taskId: number, attempt = 1): void {
  setTimeout(() => {
    void (async () => {
      const owed = await listUnwokenAnswersForTask(taskId, 1);
      if (owed.length === 0) return;
      // Row 311: a closed goal gets its answers as a card, without a run.
      if (owed[0].task_status !== 'open') {
        await showClosedGoalAnswers(taskId);
        return;
      }
      const delivered = await deliverPendingAnswers(taskId);
      if (delivered === 0 && attempt < WAKE_RETRY_ATTEMPTS) {
        deliverAnswersWhenFree(taskId, attempt + 1);
      }
    })().catch((err: unknown) =>
      // eslint-disable-next-line no-console
      console.error(
        `[task-engine] task ${taskId}: answer retry failed (the sweep will retry):`,
        (err as Error).message,
      ),
    );
  }, WAKE_RETRY_DELAY_MS).unref();
}

/**
 * Deliver wakes that the live capture path dropped (crash, deploy window,
 * busy thread). A closed task gets marked without a wake — there is nothing
 * left to deliver to; a busy thread stays unmarked and retries next sweep.
 */
async function sweepUnwokenAnswers(): Promise<void> {
  const due = await listUnwokenAnswers(MAX_UNWOKEN_PER_SWEEP);
  const sweptTasks = new Set<number>();
  let delivered = 0;
  for (const ask of due) {
    if (ask.task_status !== 'open') {
      // Row 311: a question the owner kept open after „solved" can still be
      // answered. The answer reaches them as a card — no run on a closed goal.
      await showClosedGoalAnswers(ask.task_id);
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
    // Row 322: one wake per GOAL, carrying every answer it is owed — not one
    // run per answer, ten minutes apart.
    if (sweptTasks.has(ask.task_id)) continue;
    sweptTasks.add(ask.task_id);
    delivered += await deliverPendingAnswers(ask.task_id);
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

const SCHEDULED_WAKE_TEXT =
  'დაგეგმილი შემოწმების დროა — გადახედე დავალებას და გადადგი შემდეგი ნაბიჯი.';

/**
 * The tester's 983 and board #391: at a scheduled wake the server sends the
 * held questions whose recipient's window has reopened, and the run is told
 * what went instead of being asked to send it.
 */
interface ScheduledWake {
  readonly text: string;
  /** Every held question was refused by the limit again and re-held: nothing to say. */
  readonly onlyStillHeld: boolean;
}

async function scheduledWake(taskId: number): Promise<ScheduledWake> {
  const [held, lastReply, joined, expired] = await Promise.all([
    heldOutcomes(taskId),
    lastReplyNote(taskId),
    joinedSinceNote(taskId),
    expiredNote(taskId),
  ]);
  const heldText = held.length === 0 ? null : heldAsksSentNote(held);
  const notes = [heldText, expired, joined, lastReply].filter((n): n is string => n !== null);
  return {
    text: [SCHEDULED_WAKE_TEXT, ...notes].join('\n\n'),
    onlyStillHeld: held.length > 0 && held.every(isStillHeldByTheLimit),
  };
}

async function heldOutcomes(taskId: number): Promise<HeldAskOutcome[]> {
  try {
    const held = await releaseDueHeldAsks(taskId);
    if (held.length === 0) return [];
    const task = await getTaskById(taskId);
    if (task === null) return [];
    const owner = { ownerId: task.user_id, taskId, threadId: task.thread_id ?? undefined };
    return await sendReleasedHeldAsks(owner, held);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[task-engine] task ${taskId}: held questions not sent:`, (err as Error).message);
    return [];
  }
}

/** #1684: the asks that ran out of time since the owner was last told; else null. */
async function expiredNote(taskId: number): Promise<string | null> {
  try {
    return expiredAsksNote(await claimExpiredAsksToTell(taskId));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[task-engine] task ${taskId}: expired asks not read:`, (err as Error).message);
    return null;
  }
}

/** D651: the owner's contacts who joined since the goal last ran, named for the run; else null. */
async function joinedSinceNote(taskId: number): Promise<string | null> {
  try {
    const task = await getTaskById(taskId);
    if (!task?.thread_id) return null;
    const names = await membersJoinedSinceLastRun(String(task.user_id), task.thread_id);
    if (names.length === 0) return null;
    // eslint-disable-next-line no-console
    console.log(
      `[task-engine] task ${taskId}: ${names.length} contact(s) joined since the last run`,
    );
    return newMembersNote(names);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[task-engine] task ${taskId}: new members not read:`, (err as Error).message);
    return null;
  }
}

/** The tester's 1004: what the owner last read, so a wake never sends it again. */
async function lastReplyNote(taskId: number): Promise<string | null> {
  try {
    const task = await getTaskById(taskId);
    if (!task?.thread_id) return null;
    const last = await lastAssistantMessage(task.thread_id);
    return last === null ? null : doNotRepeatNote(last);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[task-engine] task ${taskId}: last reply not read:`, (err as Error).message);
    return null;
  }
}

async function tick(): Promise<void> {
  const due = await getDueTasks(MAX_WAKES_PER_TICK);
  for (const task of due) {
    // Clear FIRST so a failing run doesn't hot-loop every tick; the model
    // re-schedules with set_task_wake when it still needs a revisit.
    await clearTaskWake(task.id);
    const wake = await scheduledWake(task.id);
    if (wake.onlyStillHeld) {
      // eslint-disable-next-line no-console
      console.log(`[task-engine] task ${task.id}: held question still over the limit — no run`);
    } else {
      await wakeTask(task.id, wake.text);
    }
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

/**
 * The tester's L4 round, thread 33740 (goal 15320): the owner typed „კი", that
 * run approved the plan and asked its one person, Ilia, at once and said so.
 * Twelve seconds later the day-one wake ran, called no tool, and wrote „I asked
 * Ilia" again. Day one's job is to START the plan. When the run that approved
 * it has already written to as many of the plan's people as day one would
 * (all of them, or its first three), day one stands down.
 */
/** An ask sent in the approving run can land a moment before the approval stamp. */
const DAY_ONE_SENT_GRACE_SECONDS = 120;
const DAY_ONE_DONE_TIMEOUT_MS = 5_000;

/**
 * The tester's 1133 (A3.1, 36526): a plan that named nobody was approved, and
 * day one ran twice with nobody to write to — each time a long message that
 * nothing went out. A plan with nobody in it has no day one to start.
 */
export enum DayOneVerdict {
  Start = 'start',
  AlreadyDone = 'already_done',
  NobodyToWriteTo = 'nobody_to_write_to',
}

export async function dayOneVerdict(taskId: number): Promise<DayOneVerdict> {
  const result = await query<{ people: number; sent: number }>(
    `SELECT jsonb_array_length(COALESCE(t.plan->'people_to_involve', '[]'::jsonb)) AS people,
            ((SELECT COUNT(*) FROM task_asks a
               WHERE a.task_id = t.id
                 AND a.created_at >= t.plan_approved_at - make_interval(secs => $2))
             + (SELECT COUNT(*) FROM introduction_requests r
               WHERE r.requester_task_id = t.id
                 AND r.created_at >= t.plan_approved_at - make_interval(secs => $2)))::int AS sent
       FROM tasks t
      WHERE t.id = $1 AND t.plan_approved_at IS NOT NULL
      LIMIT 1`,
    [taskId, DAY_ONE_SENT_GRACE_SECONDS],
    DAY_ONE_DONE_TIMEOUT_MS,
  );
  const row = result.rows[0];
  if (!row) return DayOneVerdict.Start;
  if (row.people <= 0) return DayOneVerdict.NobodyToWriteTo;
  return row.sent >= Math.min(row.people, DAY_ONE_FIRST_PEOPLE)
    ? DayOneVerdict.AlreadyDone
    : DayOneVerdict.Start;
}
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
        // The tester's 1100 (32751, request 2839): an introduction's outcome wake
        // left no trace at all — no run, no line, no log. Every way out of this
        // timer now says which one it took.
        if (!wanted) {
          // eslint-disable-next-line no-console
          console.log(`[task-engine] task ${taskId}: wake no longer wanted (attempt ${attempt})`);
          return;
        }
        const woken = await wakeTask(taskId, eventText);
        if (woken === 'woken') {
          // eslint-disable-next-line no-console
          console.log(`[task-engine] task ${taskId}: woken (attempt ${attempt})`);
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
      if (!open) return false;
      /**
       * ROW 238 (D119) — day one IS the new wave, so it is the first thing
       * that waits when the owner asks for a change.
       *
       * The plan stays approved and nothing in flight is touched; this is the
       * automatic start that does not happen until their new yes. The wake is
       * NOT finished — it is left open on purpose, so the approval that
       * follows finds it still there rather than having to arm a second one.
       */
      const task = await getTaskById(taskId);
      if (task?.plan_change_requested_at != null) {
        // eslint-disable-next-line no-console
        console.log(
          `[task-engine] task ${taskId}: day one waits — the owner asked for a change and has not said yes to a new plan`,
        );
        return false;
      }
      const verdict = await dayOneVerdict(taskId).catch(() => DayOneVerdict.Start);
      if (verdict !== DayOneVerdict.Start) {
        // eslint-disable-next-line no-console
        console.log(
          `[task-engine] task ${taskId}: day one stands down — ` +
            (verdict === DayOneVerdict.AlreadyDone
              ? "the approving run already wrote to the plan's people"
              : 'the plan names nobody to write to'),
        );
        await ensureNextWake(taskId, DEFAULT_NEXT_WAKE_HOURS);
        await finishWake(taskId, DAY_ONE_WAKE);
        return false;
      }
      return true;
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
  /**
   * ROW 104's SECOND CAUSE, AND IT IS NOT THE CONSENT WALL AT ALL.
   *
   * The wall was the first cause and it is fixed. The tester then ran the same
   * instruction on a seat with no open goal and it failed anyway: the MODEL
   * opened a goal (`create_task`, goal 9109), a new goal has no plan, and this
   * wake told it to draw one and ask „Want me to go ahead?" with two buttons.
   * So the owner typed one clear instruction and was asked a second time — row
   * 104's own words — by a different door from the one I had shut.
   *
   * D316: a typed instruction naming ONE PERSON and ONE ACTION is itself the
   * yes. Such a goal does not need a plan. It needs one ask, and one line
   * afterwards saying who it went to. Demanding a plan for it is demanding the
   * second yes the ruling exists to abolish.
   *
   * THE SERVER'S OWN GOAL PATH HAS ALWAYS KNOWN THIS — `ensureGoalForRequest`
   * refuses to open a goal from such a sentence — and `create_task`, the door
   * the model actually used, never did. The same shape this project keeps
   * finding: the rule is on one wire and not on the other. It is checked HERE,
   * at the wake, rather than at `create_task`, because refusing the goal would
   * leave the model with an instruction and nowhere to put it; letting the goal
   * exist without demanding a plan is what D316 actually describes.
   *
   * The phonebook half is paid for here on purpose. This runs once per new
   * goal, not on the hot path, and it is what keeps „ask" in an ordinary
   * sentence from being read as an instruction to somebody.
   */
  if (await goalIsAnInstruction(taskId)) {
    // eslint-disable-next-line no-console
    console.log(
      `[task-engine] goal ${taskId}: no plan asked for — the goal IS an instruction naming one contact (D316)`,
    );
    return false;
  }
  if (task.thread_id !== null && (await goalWasAnsweredOnScreen(task.thread_id))) {
    // eslint-disable-next-line no-console
    console.log(`[task-engine] goal ${taskId}: no plan asked for — it was answered on screen`);
    return false;
  }
  return !(await goalHasActedOutward(taskId));
}

/**
 * The tester's 962 (Batumi 28943): the run answered the goal from the web and
 * ended on the finish card („მოგვარებულია / ჯერ არა"); 50 seconds later this
 * wake drew a plan that wrote to nobody, under the same answer again, asking
 * „ამ გეგმას მივყვე და ვიმოქმედო?". A goal whose newest reply already asks
 * whether it is solved has nothing to plan until the owner says not yet.
 */
async function goalWasAnsweredOnScreen(threadId: number): Promise<boolean> {
  try {
    const newest = await query<{ choices: unknown }>(
      `SELECT choices FROM conversations
        WHERE thread_id = $1 AND role = 'assistant' AND kind = 'message'
        ORDER BY created_at DESC LIMIT 1`,
      [threadId],
      OWNER_QUIET_QUERY_TIMEOUT_MS,
    );
    const choices = newest?.rows[0]?.choices;
    const labels = Array.isArray(choices)
      ? choices.filter((c): c is string => typeof c === 'string')
      : [];
    return offersTheFinishCard(labels);
  } catch (error) {
    // Fails towards the plan, as before this check existed.
    // eslint-disable-next-line no-console
    console.error(`[task-engine] thread ${threadId}: could not read the newest reply:`, error);
    return false;
  }
}

/**
 * Is this goal itself a one-person, one-action instruction?
 *
 * ONE PREDICATE FOR BOTH WAKES, on purpose. `nothingToPlanYet` uses it to stay
 * silent and `instructionStillWaiting` uses it to speak; if the two read the
 * sentence differently a goal would get both events or neither, and „neither"
 * is exactly what the tester saw while this was only a suppression.
 */
export async function goalIsAnInstruction(taskId: number): Promise<boolean> {
  const task = await getTaskById(taskId);
  if (!task || task.status !== 'open') return false;
  if (task.plan !== null || task.plan_proposed !== null) return false;
  // 279 run 2: `create_task` keeps the owner's own sentence in `description`
  // as often as in the title or brief — read all three.
  const opening =
    task.thread_id === null ? null : await openingOwnerLine(task.thread_id, task.created_at);
  const goalText = [task.title, task.brief, task.description, opening]
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join(' ');
  if (!looksLikeContactInstruction(goalText)) return false;
  return messageNamesOwnContact(String(task.user_id), goalText);
}

/** The owner's line may land a moment after the goal row it opened. */
const OPENING_LINE_GRACE_SECONDS = 10;

/**
 * The tester's 1109 (a, 33795): „ჰკითხე გიორგი აბაშიძეს, სად ყიდულობს ყავას."
 * was held by Giorgi's 24-hour limit, and the model saved the goal as „a
 * question for Giorgi — where he buys coffee" with a brief that said „ვკითხო".
 * The instruction was no longer in any field the check read, so the plan wake
 * drew „ask Giorgi directly" with approve buttons for the send just refused.
 * The owner's own line that opened the goal is read with the goal's fields.
 */
async function openingOwnerLine(threadId: number, createdAt: string): Promise<string | null> {
  try {
    const result = await query<{ content: string }>(
      `SELECT content FROM conversations
        WHERE thread_id = $1 AND role = 'user' AND kind = 'message' AND TRIM(content) <> ''
          AND created_at <= $2::timestamptz + make_interval(secs => $3)
        ORDER BY created_at DESC LIMIT 1`,
      [threadId, createdAt, OPENING_LINE_GRACE_SECONDS],
      OWNER_QUIET_QUERY_TIMEOUT_MS,
    );
    return result.rows[0]?.content ?? null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[task-engine] thread ${threadId}: could not read the opening line:`, error);
    return null;
  }
}

/** The same goal, still unacted-on, is what the instruction event is for. */
async function instructionStillWaiting(taskId: number): Promise<boolean> {
  if (!(await goalIsAnInstruction(taskId))) return false;
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

/**
 * The tester's 1100 (goal 14966): a restart six seconds after the answer lost
 * this wake. It now leaves a row with its words, like day one, and the sweeper
 * re-runs it with no delay. `delayMs` is a parameter for the sweeper only.
 */
export function startIntroOutcome(
  taskId: number,
  eventText: EventText,
  delayMs: number = INTRO_OUTCOME_DELAY_MS,
): void {
  const queuedAt = new Date();
  // eslint-disable-next-line no-console
  console.log(`[task-engine] task ${taskId}: introduction outcome wake scheduled`);
  void recordWake(taskId, INTRO_OUTCOME_WAKE, delayMs, eventText);
  wakeWhenFree(
    taskId,
    eventText,
    async () => {
      if (await wakeDoneSince(taskId, INTRO_OUTCOME_WAKE, queuedAt)) return false;
      const open = await goalOpen(taskId);
      if (!open) await finishWake(taskId, INTRO_OUTCOME_WAKE);
      return open;
    },
    () => finishWake(taskId, INTRO_OUTCOME_WAKE),
    delayMs,
    1,
    () => finishWake(taskId, INTRO_OUTCOME_WAKE),
  );
}

/** Whether a stored value is an event text: one string, or one per language. */
export function isEventText(value: unknown): value is EventText {
  if (typeof value === 'string') return value.trim() !== '';
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.values(value as Record<string, unknown>);
  return entries.length > 0 && entries.every((v) => typeof v === 'string');
}

/**
 * ⚠️ ROW 267 — IT ASKED THE OWNER A QUESTION AND THEN DID NOT WAIT FOR IT.
 *
 * Thread 24391, by the clock:
 *
 *   10:26:23  „I'm moving to Argentina next year for business. Who could help?"
 *   10:26:46  „What kind of business is this, and what would help most: local
 *              partners and clients, legal or visa …?"
 *   10:26:55  a goal is saved and the plan wake fires — NINE SECONDS LATER
 *   10:27:19  „Plan v1 (awaiting your approval)" with two buttons
 *
 * The person is asked something, and before they can type a word they are
 * handed a plan built without their answer, ending in the same question again.
 *
 * The engine could not see it. `nothingToPlanYet` asks whether the goal has a
 * plan, whether it is a one-person instruction, and whether it has acted
 * outward. None of those is „the owner is mid-sentence". The question was
 * asked in ORDINARY PROSE, not through `ask_owner_decision`, so
 * `pending_question_at` is null and the one flag that exists says nothing.
 *
 * ⚠️ IT POSTPONES AND DOES NOT CANCEL, and that distinction is the whole
 * design. `getGoalsSilentForDays` requires `plan IS NOT NULL`, so a goal with
 * NO plan is not picked up by the method-change sweep — dropping the wake
 * outright would leave a goal nobody ever plans if the owner never answers.
 * I checked that query before choosing; cancelling would have been the tidier
 * code and the worse product.
 */
const PLAN_POSTPONE_MS = 15 * 60_000;
const PLAN_POSTPONE_ATTEMPTS = 3;

/**
 * Has the owner been asked something on this goal's thread and not answered?
 *
 * A question mark is the signal, and it is the same mark in all four languages
 * this product speaks — Spanish opens with „¿" and still closes with „?". That
 * is a deliberately dumb test: anything cleverer would be a sentence
 * classifier tuned on the handful of cases I happen to have read.
 */
export async function ownerWasAskedAndHasNotAnswered(taskId: number): Promise<boolean> {
  const result = await query<{ waiting: boolean }>(
    `WITH t AS (SELECT thread_id FROM tasks WHERE id = $1),
          spoke AS (
            SELECT role, content, created_at
              FROM conversations c, t
             WHERE c.thread_id = t.thread_id
               AND c.kind = 'message'
               AND TRIM(c.content) <> ''
               AND c.role IN ('user', 'assistant')
             ORDER BY c.created_at DESC
             LIMIT 1
          )
     SELECT (role = 'assistant' AND TRIM(content) LIKE '%?') AS waiting FROM spoke`,
    [taskId],
    OWNER_QUIET_QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.waiting === true;
}

/**
 * The tester's 1044 — has this goal's thread already been searched AND
 * answered since the goal was saved? Then the plan turn must not search again
 * (see PLAN_FROM_FINDINGS_EVENT). The opening searches and the owner's own run
 * both count; the window opens a few minutes before the goal, because a goal
 * is saved in the middle of the run that searched for it.
 */
const SEARCH_TOOL_NAMES: readonly string[] = [
  'search_by_tag',
  'search_by_insight',
  'search_second_degree',
  'search_contact_by_name',
  'search_roster',
  'web_search',
];

export async function goalAlreadySearchedAndAnswered(taskId: number): Promise<boolean> {
  const result = await query<{ done: boolean }>(
    `WITH t AS (SELECT thread_id, created_at FROM tasks WHERE id = $1),
          searched AS (
            SELECT MAX(l.created_at) AS at
              FROM tool_call_log l, t
             WHERE l.thread_id = t.thread_id
               AND l.created_at >= t.created_at - interval '5 minutes'
               AND split_part(l.tool, ':', 1) = ANY($2::text[])
          )
     SELECT EXISTS (
       SELECT 1 FROM conversations c, t, searched s
        WHERE c.thread_id = t.thread_id AND c.role = 'assistant' AND c.kind = 'message'
          AND c.run_id IS NOT NULL AND TRIM(c.content) <> '' AND c.created_at > s.at
     ) AS done`,
    [taskId, SEARCH_TOOL_NAMES],
    OWNER_QUIET_QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.done === true;
}

/** The plan turn for a goal whose findings are already on the screen. */
function startPlanFromFindings(taskId: number): void {
  wakeWhenFree(
    taskId,
    PLAN_FROM_FINDINGS_EVENT,
    () => nothingToPlanYet(taskId),
    () => Promise.resolve(),
    0,
  );
}

export function startPlanProposal(taskId: number, attempt = 1): void {
  wakeWhenFree(
    taskId,
    PLAN_PROPOSAL_EVENT,
    async () => {
      if (!(await nothingToPlanYet(taskId))) return false;
      if (await ownerWasAskedAndHasNotAnswered(taskId)) {
        if (attempt < PLAN_POSTPONE_ATTEMPTS) {
          // eslint-disable-next-line no-console
          console.log(
            `[task-engine] goal ${taskId}: the owner was asked something and has not answered — ` +
              `plan held, attempt ${attempt}`,
          );
          startPlanProposal(taskId, attempt + 1);
        } else {
          // Bounded on purpose: after three holds the goal gets its plan
          // anyway, because a goal nobody ever plans is worse than a plan
          // proposed while a question is still open.
          // eslint-disable-next-line no-console
          console.log(
            `[task-engine] goal ${taskId}: held ${attempt} times for an unanswered question — ` +
              'planning anyway',
          );
          return true;
        }
        return false;
      }
      if (await goalAlreadySearchedAndAnswered(taskId)) {
        // eslint-disable-next-line no-console
        console.log(`[task-engine] goal ${taskId}: already searched and answered — plan only`);
        startPlanFromFindings(taskId);
        return false;
      }
      return true;
    },
    () => Promise.resolve(),
    attempt === 1 ? PLAN_PROPOSAL_DELAY_MS : PLAN_POSTPONE_MS,
  );
  /**
   * ROW 104 — AND THE OTHER HALF, because taking the plan away is only half an
   * answer and the tester proved it: no plan card, and no message either.
   *
   * Both wakes are armed and their gates are mutually exclusive by
   * construction — `nothingToPlanYet` is false exactly when
   * `instructionStillWaiting` is true, because both ask `goalIsAnInstruction`.
   * Arming both rather than choosing here keeps the decision at the moment the
   * wake FIRES, when the goal's state is settled; that is why every other gate
   * in this file is a callback and not a branch at call time.
   */
  wakeWhenFree(
    taskId,
    INSTRUCTION_EVENT,
    () => instructionStillWaiting(taskId),
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
        'ბოლოს ერთი სტრიქონი: რა მიდის ახლა და ვის ვკითხე; თუ პასუხს ელოდები, ზუსტად „როგორც კი ვინმე გიპასუხებს, მაშინვე გეტყვი." — საათები და დღეები არ ახსენო (D563). ' +
        RULE_268_QUIET_DAY_THREE,
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
/**
 * ⚠️ FIVE BECAME TEN ON 27 SEPTEMBER, ON MISHO'S EXPLICIT WORD, AND THE PRICE
 * IS NAMED HERE SO NOBODY HAS TO GUESS IT LATER.
 *
 * WHAT IT BUYS. Row 278: the widening queue is ordered by `last_activity_at`,
 * so a goal people touch often keeps falling to the back. The obvious fix was
 * to order by how long the question has waited — and measuring it showed that
 * fix would have put the tester's own goal LAST of forty-seven, because it is
 * the newest. Each ordering has its own victim; the depth does not. Measured
 * 26 September: 47 goals eligible against 120 sweeps a day, so ten an hour
 * clears the backlog in about five hours instead of ten and stops the
 * ordering from deciding who waits.
 *
 * WHAT IT COSTS, PLAINLY. A widening wake tells a goal to write to the next
 * people its plan names — several, not one. Twice the goals an hour is twice
 * the real people written to in that hour. That is why this number was never
 * mine to change: it is not a performance setting, it is how much the product
 * does in somebody's name per hour. Misho was told exactly this and said to
 * raise it.
 *
 * IF IT IS EVER RAISED AGAIN, the question to ask is not „can the server take
 * it" — it can — but „how many people should hear from us in one hour".
 */
const MAX_SILENT_WAKES_PER_SWEEP = 10;

export async function sweepSilentGoals(): Promise<number> {
  const silent = await getSilentGoals(SILENT_DAY_HOURS, MAX_SILENT_WAKES_PER_SWEEP);
  let woken = 0;
  for (const task of silent) {
    await markSilentDayWoken(task.id);
    // #1685 (A2): a silent day opens the next wave even while some still wait.
    await widenWaveOnSilence(task).catch((err: unknown) =>
      // eslint-disable-next-line no-console
      console.error(`[task-engine] task ${task.id}: next wave not opened:`, (err as Error).message),
    );
    const ok = await wakeTask(
      task.id,
      'ერთი დღეა კითხვა უპასუხოდ არის და ახალი არავის მისწერია. სტანდარტის წესია: ჩუმი დღე = ' +
        'მეტ ადამიანს ჰკითხე. გეგმის „ვის ვკითხავ" სიიდან, ვისაც ჯერ არ მისწერია, ახლა მისწერე — ' +
        'რამდენიმეს ერთდროულად, არა თითო-თითოდ. ეს გეგმის ფარგლებშია და ცალკე თანხმობა არ სჭირდება. ' +
        'თუ სიაში ყველას უკვე მისწერე — ეს მეთოდის შეცვლის დროა: propose_task_plan-ით შესთავაზე ' +
        'ახალი წრე ან ახალი გზა. ბოლოს ერთი სტრიქონი: რა მიდის ახლა და ვის ვკითხე; თუ პასუხს ელოდები, ზუსტად „როგორც კი ვინმე გიპასუხებს, მაშინვე გეტყვი." — საათები და დღეები არ ახსენო (D563). ' +
        RULE_268_QUIET_DAY_ONE,
    );
    if (ok === 'woken') woken++;
    // The stamp said this goal had been widened. A busy thread means nobody
    // was written to, and the next sweep must be allowed to try again rather
    // than treat it as done for a day — see `unmarkSilentDayWoken`.
    else if (ok === 'busy') await unmarkSilentDayWoken(task.id);
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
        'ყოველი პასუხი დაასრულე ერთი სტრიქონით: რა მიდის ახლა და ვის ვკითხე; თუ პასუხს ელოდები, ზუსტად „როგორც კი ვინმე გიპასუხებს, მაშინვე გეტყვი." — საათები და დღეები არ ახსენო (D563). ' +
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

  /**
   * ⚠️ THESE THREE ASK THE DATABASE WHETHER THEY ARE DUE, and that is the
   * whole point of `claimSweep`.
   *
   * They used to hang off the interval alone, which meant the clock lived in
   * this process — and a deploy replaces the process. On 26 September the
   * longest gap between deploys all afternoon was twenty-five minutes, so the
   * hour never elapsed and none of the three ran at all: nobody waiting on an
   * ask was reminded, no goal widened after a silent day, no method change
   * fired. No error, no row, nothing to notice.
   *
   * With the claim, a restart costs nothing: the tick after boot sees the slot
   * is overdue and takes it. The interval is now only how OFTEN we ask, and
   * the answer comes from a timestamp that outlives the container.
   */
  const runHourlySweeps = (): void => {
    void claimSweep(SWEEP_ASK_REMINDERS, CLAIM_WINDOW_MINUTES).then((due) => {
      if (!due) return;
      void sendDueAskReminders(MAX_REMINDERS_PER_SWEEP).catch((err) =>
        // eslint-disable-next-line no-console
        console.error('[task-engine] reminder sweep failed:', (err as Error).message),
      );
    });
    void claimSweep(SWEEP_SILENT_GOALS, CLAIM_WINDOW_MINUTES).then((due) => {
      if (!due) return;
      void sweepSilentGoals()
        .then((n) => {
          // eslint-disable-next-line no-console
          if (n > 0) console.log(`[task-engine] silent-day widening woke ${n} goal(s)`);
        })
        .catch((err) =>
          // eslint-disable-next-line no-console
          console.error('[task-engine] silent-day sweep failed:', (err as Error).message),
        );
    });
    void claimSweep(SWEEP_ASK_EXPIRY, CLAIM_WINDOW_MINUTES).then((due) => {
      if (!due) return;
      void expireSilentAsks()
        .then((n) => {
          // eslint-disable-next-line no-console
          if (n > 0) console.log(`[task-engine] ${n} ask(s) expired after two weeks of silence`);
        })
        .catch((err) =>
          // eslint-disable-next-line no-console
          console.error('[task-engine] ask expiry sweep failed:', (err as Error).message),
        );
    });
    void claimSweep(SWEEP_METHOD_CHANGES, CLAIM_WINDOW_MINUTES).then((due) => {
      if (!due) return;
      void sweepMethodChanges()
        .then((n) => {
          // eslint-disable-next-line no-console
          if (n > 0) console.log(`[task-engine] method-change proposal woke ${n} goal(s)`);
        })
        .catch((err) =>
          // eslint-disable-next-line no-console
          console.error('[task-engine] method-change sweep failed:', (err as Error).message),
        );
    });
  };

  /**
   * ⚠️ ONCE SHORTLY AFTER BOOT, NOT ONLY ON THE HOUR. Without this a container
   * that replaces one which died mid-hour still waits a full interval before
   * asking, which is the same starvation in a smaller form. The delay lets the
   * pool and the migrations settle first; the claim decides whether anything
   * actually runs.
   */
  setTimeout(runHourlySweeps, BOOT_SWEEP_DELAY_MS).unref();

  setInterval(() => {
    runHourlySweeps();
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
