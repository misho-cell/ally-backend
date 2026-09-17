import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { param, body, validationResult } from 'express-validator';
import {
  authenticateJwt,
  requireUserRole,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { requireSubscriptionUnlessAnswering } from '../middleware/subscription.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { captureDeviceFingerprint } from '../middleware/deviceFingerprint.middleware';
import {
  getThreadsForUser,
  createThread,
  getThread,
  getThreadMessages,
  updateThreadTitle,
  saveThreadMessage,
  getLongestRunStep,
  DEFAULT_NEW_THREAD_TITLE,
} from '../../services/threads.service';
import { processChat, ChatResult } from '../../services/chat.service';
import { setThreadStatus, endsWithQuestion } from '../../services/threadStatus.service';
import { markRunFailed } from '../../services/runFailure.service';
import {
  hasPendingAskForThread,
  cancelAsksForTask,
  runPayerFor,
} from '../../services/taskAsks.service';
import { getOpenTaskByThread, Task } from '../../services/taskStore.service';
import { stopGoalOnThread } from '../../services/goalStop.service';
import { planInForce } from '../../services/taskPlans.service';
import {
  clearGoalQuestionForThread,
  goalQuestionFlaggedSince,
} from '../../services/goalQuestions.service';
import { hasPendingIntroForThread } from '../../services/introduction.service';
import { generateThreadTitle } from '../../services/threadTitle.service';
import { sweepFactsFromExchange } from '../../services/factExtraction.service';
import { ThreadStatus, deleteThread } from '../../services/threads.service';
import { query } from '../../db/postgres/client';
import { checkRunAllowance } from '../../services/tokenWallet.service';
import { budgetWindow } from '../../services/budgetWindow';
import {
  subscribeUserEvents,
  emitThreadCreated,
  emitThreadUpdated,
  emitRunComplete,
  emitRunError,
  deviceKey,
} from '../../services/sse.service';
import { sendPushNotification } from '../../services/notification.service';
import { scrubText } from '../../services/privacyScrub';
import { RUN_STRINGS, detectRunLanguage } from '../../services/runLanguage';
import { claimRun, releaseRun } from '../../services/runDedupe';
import { beginRun, endRun, isDraining } from '../../services/inFlightRuns';
import { ApiResponse } from '../../types';

const threadsRouter = Router();

// Ceiling on a single background run — from the shared budget family, so
// raising the wall clock via env raises this with it (see config/runBudgets).
import { RUN_HARD_TIMEOUT_MS } from '../../config/runBudgets';

// A timed-out run's longest persisted step must be at least this long to be
// worth flushing as a partial answer (anything shorter is spinner narration).
const MIN_PARTIAL_FLUSH_CHARS = 80;

// The provisional (pre-generator) title keeps only the message's first words.
const PROVISIONAL_TITLE_WORDS = 6;

// Short, phone-safe preview for the push body. Scrub first (the reply is already
// scrubbed for SSE, but this path is independent), collapse whitespace, truncate.
const PUSH_PREVIEW_MAX_CHARS = 120;
function buildPushPreview(reply: string): string {
  const safe = scrubText(reply).replace(/\s+/g, ' ').trim();
  if (safe.length === 0) return 'შენი პასუხი მზადაა';
  return safe.length > PUSH_PREVIEW_MAX_CHARS
    ? safe.slice(0, PUSH_PREVIEW_MAX_CHARS - 1).trimEnd() + '…'
    : safe;
}

/**
 * Terminal thread status for a finished run: an in-flight introduction request
 * outranks everything (the thread is genuinely waiting on a third party), then
 * an explicit or trailing question to the user, else the run is simply done.
 *
 * `pendingAsk` carries the same truth from the ask engine: a thread whose
 * question is sitting unanswered on someone else's phone is WAITING, whatever
 * the reply text looked like. Without it thread 8416 — the dentist question to
 * Lika, unanswered — was filed as finished and sank to the bottom of the list
 * (ticket 4 item 0C.5).
 */
/**
 * Is this goal waiting for the owner to approve a plan?
 *
 * The same test createAsk uses to refuse with consent_pending: a plan has been
 * proposed and no plan is in force. Read from the GOAL rather than inferred
 * from the conversation, because the conversation is exactly what was wrong.
 */
export function awaitingPlanApproval(
  task: Pick<Task, 'plan' | 'plan_version' | 'plan_approved_at' | 'plan_proposed'> | null,
): boolean {
  if (task === null) return false;
  return task.plan_proposed !== null && planInForce(task) === null;
}

function statusAfterRun(
  result: ChatResult,
  pendingAsk: boolean,
  opts: {
    /** The thread carries a work item (open task, incoming ask, campaign). */
    workItem: boolean;
    /** The model registered a blocking question during THIS run. */
    flagged: boolean;
    /** The goal on this thread has a plan proposed and not yet approved. */
    awaitingPlanApproval: boolean;
  },
): ThreadStatus {
  // An explicit ask_owner_decision outranks everything: the model itself said
  // the work is blocked on the owner (ticket 8 task 2b).
  if (opts.flagged) return 'needs_you';
  // A proposed plan nobody has approved is BY DEFINITION waiting on the owner,
  // whatever the last reply looked like (goal 3466 / thread 15577, reported
  // 16 September).
  //
  // Everything below this line reads the REPLY. That is the right question for
  // a plain conversation and the wrong one for a goal: the tester typed a
  // detail under the plan card, the model answered it in a sentence, no
  // question mark, no buttons — and the run fell through to `done`. The app
  // then showed „დასრულდა", filed the goal under finished, and hid both the
  // approve buttons and „გაჩერება". The goal stayed open behind the screen at
  // stage plan_proposed, blocker plan_approval, with no way left to approve it,
  // change it or stop it.
  //
  // The same shape as the G2 fix an hour earlier, and worth naming because it
  // keeps recurring: the code asked what the SERVER had just said instead of
  // what the WORK was waiting for.
  if (opts.awaitingPlanApproval) return 'needs_you';
  if (result.requestCreated === true) return 'waiting';
  // Third-party dependency outranks the reply's own shape: while an ask or an
  // introduction sits unanswered on someone else's phone the user owes
  // nothing, however chatty the acknowledgement was (ticket 6 B2: thread 8556
  // stayed needs_you because its reply ended with a question).
  if (pendingAsk) return 'waiting';
  // Ticket 8 task 2(b): the badge means "this thread waits for the user",
  // nothing else — and only a WORK item can wait for the user. A plain
  // conversation whose last reply happens to end with a question is finished
  // when the user walks away, not flagged forever (442 stale flags on one
  // account, fourteen of the tester's forty visible threads).
  if (!opts.workItem) return 'done';
  if (result.options || result.choices || endsWithQuestion(result.reply)) return 'needs_you';
  return 'done';
}

threadsRouter.use(authenticateJwt, requireUserRole);

// Mounted HERE, above the subscription gate, and the position is the point.
// tasks.routes carries the same route with the comment „no subscription gate on
// purpose: stopping a running task must always work" — and the first draft of
// this one sat at the bottom of the file, behind the gate, which would have
// left a lapsed account unable to stop a goal that is still writing to people
// on its behalf. It keeps its own rate limit, the same 30/min tasks.routes uses.

/**
 * Stop the goal running on THIS thread — Ticket 20 row 113.
 *
 * The chat view has no goal id. The frontend checked: their thread object
 * carries id, type, title, last_message, updated_at, status, status_line,
 * is_task and request_ref, and nothing else, so the header button had been
 * posting the thread id to `/tasks/:id/stop`, which is keyed on the GOAL id.
 * It 404'd, the 404 was shown to nobody, and the owner walked away believing a
 * running goal had stopped while it kept working and kept waking.
 *
 * So: a route keyed on what the screen actually holds. This is still the right
 * route to call. Since the second pass of row 113, `/tasks/:id/stop` also
 * accepts a thread id — but only once the id has failed to be a goal of the
 * caller, so it cannot guess between the two, and only because the header
 * button is still posting there and no frontend session is reading the board.
 * The shared implementation is `stopGoalOnThread`, so the two cannot drift.
 *
 * The three answers are distinguishable on purpose, because the frontend shows
 * a banner and needs to know which case it is in:
 *
 *   200 { stopped: true,  goal_id }                 it was running; it is closed now
 *   200 { stopped: false, reason: 'no_open_goal' }  nothing was running to stop
 *   404                                             no such thread, or not theirs
 */
threadsRouter.post(
  '/:id/stop',
  rateLimit({ windowMs: 60_000, max: 30 }),
  param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'id must be a positive integer' });
      return;
    }
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const threadId = Number(req.params.id);
      // One implementation, shared with the thread-id fallback on
      // `/tasks/:id/stop` — two stop paths that drift apart is a worse bug than
      // the one row 113 fixes: the copy that forgot to cancel the asks would go
      // on writing to real people after the owner pressed stop.
      const stopped = await stopGoalOnThread(userId, threadId);
      if (stopped === null) {
        res.status(404).json({ success: false, error: 'თრედი ვერ მოიძებნა' });
        return;
      }
      res.status(200).json({ success: true, data: stopped });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[POST /threads/:id/stop]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// A lapsed account may still open and answer a thread in which somebody is
// asking THEM (Ticket 10 Task 25 (b), D123) — everything else meets the paywall.
threadsRouter.use(requireSubscriptionUnlessAnswering);
// Per-user cap on chat/thread traffic (abuse control). A rejected SEND leaves
// a visible error row — thread 9873 sat empty forever after a 429 while the
// user's message painted optimistically (task 38).
const MESSAGE_PATH_RE = /^\/(\d+)\/message$/;
threadsRouter.use(
  rateLimit({
    windowMs: 60_000,
    max: 60,
    onLimit: (req) => {
      if (req.method !== 'POST') return;
      const match = MESSAGE_PATH_RE.exec(req.path);
      if (!match) return;
      const userId = (req as AuthenticatedRequest).user?.userId;
      if (!userId) return;
      void saveThreadMessage(
        Number(match[1]),
        Number(userId),
        'assistant',
        'შეტყობინება ვერ მივიღე — ძალიან ბევრი ზედიზედ. ერთ წუთში ისევ სცადე.',
        'error',
      ).catch(() => undefined);
    },
  }),
);
threadsRouter.use(captureDeviceFingerprint);

function handleValidationErrors(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const message = errors
      .array()
      .map((err) => err.msg)
      .join(', ');
    res.status(400).json({ success: false, error: message });
    return;
  }
  next();
}

threadsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as AuthenticatedRequest).user.userId;
    // Optional paging — omitted, the response is exactly what it always was, so
    // no client breaks. A client that passes ?limit= gets a page and walks back
    // with ?before=<last updated_at>&before_id=<last id>.
    const rawLimit = Number(req.query.limit);
    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    const rawBeforeId = Number(req.query.before_id);
    const threads = await getThreadsForUser(userId, {
      ...(Number.isFinite(rawLimit) && rawLimit > 0 && { limit: Math.floor(rawLimit) }),
      ...(before && { beforeUpdatedAt: before }),
      ...(Number.isFinite(rawBeforeId) && rawBeforeId > 0 && { beforeId: Math.floor(rawBeforeId) }),
    });
    res.status(200).json({ success: true, data: threads });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /threads]', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch threads';
    res.status(500).json({ success: false, error: message });
  }
});

threadsRouter.get('/stream', (req: Request, res: Response): void => {
  const userId = (req as AuthenticatedRequest).user.userId;
  // Which device is watching, so the push can be withheld from THIS screen and
  // still reach the others (row 6).
  //
  // The query parameter is what the frontend sends, and the right choice for
  // this route specifically: the stream reconnects on its own, often, and a
  // custom header puts a preflight round trip in front of every reconnect —
  // with a failure mode (the stream dies) out of all proportion to what is
  // being carried. CORS was not the reason: `cors()` here reflects the headers
  // a browser asks for, so X-Device-Id was always allowed.
  //
  // The header is read too, because their authHeaders() already puts it on
  // every other request and a device named twice is better than one named
  // never. The user-agent still answers when neither arrives.
  const cleanup = subscribeUserEvents(
    userId,
    res,
    deviceKey(
      typeof req.query.device_id === 'string' ? req.query.device_id : null,
      req.get('x-device-id'),
      req.get('user-agent'),
    ),
  );
  req.on('close', cleanup);
});

threadsRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as AuthenticatedRequest).user.userId;
    const thread = await createThread(userId, 'regular');
    emitThreadCreated(userId, {
      id: thread.id,
      type: thread.type,
      title: thread.title,
      is_task: thread.is_task,
      status: thread.status,
      status_line: thread.status_line,
    });
    res.status(201).json({ success: true, data: thread });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[POST /threads]', error);
    const message = error instanceof Error ? error.message : 'Failed to create thread';
    res.status(500).json({ success: false, error: message });
  }
});

threadsRouter.get(
  '/:id/messages',
  param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const threadId = Number(req.params.id);

      const thread = await getThread(threadId, userId);
      if (thread === null) {
        res.status(404).json({ success: false, error: 'Thread not found' });
        return;
      }

      // Optional paging — omitted, the whole history comes back exactly as
      // before. ?limit=30 opens the chat on its most recent 30 messages; the
      // client loads older ones by passing the oldest row it holds as the
      // cursor (?before=<created_at>&before_id=<id>).
      const rawLimit = Number(req.query.limit);
      const before = typeof req.query.before === 'string' ? req.query.before : undefined;
      // A UUID string on prod — passed through verbatim, never parsed.
      const beforeId = typeof req.query.before_id === 'string' ? req.query.before_id : undefined;
      const messages = await getThreadMessages(threadId, {
        ...(Number.isFinite(rawLimit) && rawLimit > 0 && { limit: Math.floor(rawLimit) }),
        ...(before && { beforeCreatedAt: before }),
        ...(beforeId && { beforeId }),
      });
      res.status(200).json({ success: true, data: messages });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[GET /threads/:id/messages]', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch messages';
      res.status(500).json({ success: false, error: message });
    }
  },
);

threadsRouter.post(
  '/:id/message',
  param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
  body('message')
    .isString()
    .trim()
    .notEmpty()
    .isLength({ max: 10000 })
    .withMessage('შეტყობინება ძალიან გრძელია — გთხოვ, დაამოკლე (მაქს. 10000 სიმბოლო).'),
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const threadId = Number(req.params.id);
      const { message, as_goal, in_reply_to_message_id } = req.body as {
        message: string;
        as_goal?: unknown;
        in_reply_to_message_id?: unknown;
      };

      const thread = await getThread(threadId, userId);
      if (thread === null) {
        res.status(404).json({ success: false, error: 'Thread not found' });
        return;
      }

      // Provisional title immediately (never a blank row in the chat list);
      // the model-written title is generated AFTER the run, from the FINAL
      // reply (ticket 6 close, task 20: draft-time titles echoed the opener
      // the strip was about to remove and contradicted their own answers).
      const needsTitle =
        thread.type === 'regular' &&
        (thread.title === null || thread.title === DEFAULT_NEW_THREAD_TITLE);
      if (needsTitle) {
        const provisional = message.split(/\s+/).slice(0, PROVISIONAL_TITLE_WORDS).join(' ');
        await updateThreadTitle(threadId, provisional.slice(0, MAX_TITLE_CHARS));
      }

      // Token wallet gate: when enabled, an exhausted balance blocks new runs
      // (the in-flight one always completes). 402 carries a machine reason so
      // the app can show the right screen.
      //
      // On an incoming-ask thread the wallet checked is the ASKER's, not the
      // helper's (Ticket 10 Task 25 (a), D123: the original requester pays for
      // the whole chain; helpers are never charged). A helper is never blocked
      // by the asker's empty wallet either: the answer is what the asker paid
      // their ask for, so the run goes and the asker's balance takes it — the
      // asker's own next run is the one that waits for a top-up.
      // Row 150: null means nobody pays — a campaign invite, which the
      // platform started and nobody asked for. There is no wallet to check,
      // and checking the helper's would be the charge this rule removes.
      const payerId = await runPayerFor(userId, threadId, thread.type);
      const allowance =
        payerId === null ? { allowed: true as const } : await checkRunAllowance(payerId);
      if (!allowance.allowed && payerId === userId) {
        // The renewal named is the window in force (D124): monthly today,
        // weekly once BUDGET_WINDOW=week — the text must not promise the
        // wrong day.
        const renewal = budgetWindow().unit === 'week' ? 'კვირის' : 'თვიურ';
        res.status(402).json({
          success: false,
          error: `ტოკენები ამოგეწურა — შეიძინე დამატებით ან დაელოდე ${renewal} განახლებას`,
          reason: 'insufficient_tokens',
          balance: allowance.balance,
          window: budgetWindow().label,
        });
        return;
      }

      // Accept the message and process it in the background. The agent loop can
      // take minutes for large multi-step tasks, so we never hold the HTTP
      // request open: progress and the final answer are streamed over SSE
      // (GET /threads/stream), keyed by runId.
      // Ticket 20 row 205: the server is going away, so a run started now
      // would be killed before it answered. The owner is told that, in those
      // terms, instead of „please try again" — which blames them for our
      // deploy and invites them to lose a second run to the same restart.
      if (isDraining()) {
        res.status(503).json({
          success: false,
          error: 'სერვერი ახლა ახლდება — რამდენიმე წამში თავიდან სცადე.',
          reason: 'restarting',
        });
        return;
      }

      const runId = randomUUID();

      // Ticket 20 row 115. Ninia's „კი" arrived five times in six seconds and
      // started five runs. An identical message from the same person on the
      // same thread is refused only while an identical message's run is STILL
      // IN FLIGHT — a person repeats themselves after reading a reply, never
      // before, so this catches the double submit and not the real repeat.
      //
      // The duplicate is answered with the run already going rather than an
      // error: all five requests then watch the same answer arrive over SSE,
      // which is what the sender believes is happening anyway.
      const alreadyRunning = claimRun(userId, threadId, message, runId);
      if (alreadyRunning !== null) {
        res.status(202).json({ success: true, runId: alreadyRunning, duplicate: true });
        return;
      }

      res.status(202).json({ success: true, runId });

      // Ticket 7 Task 1(c), founder's ruling D48: an incoming_ask thread is a
      // PRIVATE conversation between the recipient and their own assistant.
      // The auto-capture that lived here — the recipient's first raw message
      // becoming the asker's answer before the assistant even ran (asks
      // 892/925: answered_at preceded the message row) — is removed. The only
      // path to the asker is now send_answer_to_asker, called by the
      // assistant with the exact text the recipient approved.

      // The run is in flight — every device's chat list shows "working" from
      // the server-held state (no more client-local status guessing). The
      // caption follows the message's language (22(h)'s in-progress half: an
      // English thread read „ვმუშაობ…" for the whole run, tester 22 Aug).
      void setThreadStatus(userId, threadId, 'working', {
        statusLine: RUN_STRINGS[detectRunLanguage(message)].statusLines.working,
      });

      // The owner showed up in the goal's own thread — whatever question was
      // pending for them is being engaged right now; the model re-flags with
      // ask_owner_decision if it is still blocked after this exchange.
      void clearGoalQuestionForThread(userId, threadId).catch(() => undefined);
      const runStartedAt = new Date();

      // Hard outer timeout: the run's own budget (~90s) normally forces a final
      // answer, but a truly stuck call (a hung external dependency the inner
      // watchdogs miss) could otherwise leave the client waiting forever with the
      // input locked — which cost us a tester. If the run hasn't produced a reply
      // by this ceiling, surface a visible, retryable error instead of silence.
      // (The orphaned run may still finish; the race has already settled, so its
      // late result is ignored and never double-emitted.)
      // Row 205: counted for the drain, so a shutdown knows what it is about
      // to cut off and can say so.
      beginRun(runId);
      const hardTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('RUN_HARD_TIMEOUT')), RUN_HARD_TIMEOUT_MS),
      );
      Promise.race([
        processChat(userId, threadId, message, runId, undefined, {
          asGoal: as_goal === true,
          ...(typeof in_reply_to_message_id === 'string' && {
            inReplyToMessageId: in_reply_to_message_id,
          }),
        }),
        hardTimeout,
      ])
        .then(async (result) => {
          // Waiting covers BOTH kinds of third-party dependency: an unanswered
          // ask AND an unanswered introduction request (ticket 5 item B2).
          //
          // A CHECK THAT COULD NOT RUN IS NOT A "NO". Both of these used to
          // catch into `false`, which reads as "nobody owes an answer" and
          // sends the thread to done. A database hiccup would then be rendered
          // to the owner as "finished" — an error wearing the clothes of a
          // confident answer, which is the same substitution as telling
          // somebody their note was deleted when it was not. When we cannot
          // tell, we say waiting: that claims only that something may still be
          // out there, which is true.
          const pendingIntro =
            thread.type === 'outgoing_request' &&
            (await hasPendingIntroForThread(thread.introduction_request_id).catch(
              (err: unknown) => {
                // eslint-disable-next-line no-console
                console.error('[run] pending-intro check failed:', (err as Error).message);
                return true;
              },
            ));
          // The run itself reports failure (e.g. an empty final) — surface a
          // retryable error, never a "successful" empty answer.
          if (result.runFailed === true) {
            emitRunError(userId, threadId, runId, result.reply);
            void markRunFailed(userId, threadId, result.language ?? 'ka');
            return;
          }
          emitRunComplete(userId, threadId, runId, {
            reply: result.reply,
            ...(result.options && { options: result.options }),
            ...(result.choices && { choices: result.choices }),
            ...(result.taskResult && { result: result.taskResult }),
            // Ticket 17 Task 39: the share button reads this, not the prose.
            ...(result.shareText && { share_text: result.shareText }),
          });
          // Title from the FINAL, post-strip reply (task 20) — never from a draft.
          if (needsTitle) void generateThreadTitle(userId, threadId, message, result.reply);
          // Engine T1: catches facts about named third parties the live
          // assistant decided not to save mid-conversation.
          void sweepFactsFromExchange(userId, threadId, message, result.reply);
          // Persist + broadcast the terminal status. The thread becomes a task
          // once a run sent a request or reported a structured result.
          const becameTask = result.requestCreated === true || result.taskResult !== undefined;
          const pendingAsk =
            (await hasPendingAskForThread(threadId).catch((err: unknown) => {
              // eslint-disable-next-line no-console
              console.error('[run] pending-ask check failed:', (err as Error).message);
              return true;
            })) || pendingIntro;
          const openTask = await getOpenTaskByThread(threadId).catch(() => null);
          const flagged =
            openTask !== null &&
            (await goalQuestionFlaggedSince(openTask.id, runStartedAt).catch(() => false));
          const finalStatus = statusAfterRun(result, pendingAsk, {
            workItem: thread.type !== 'regular' || openTask !== null || becameTask,
            flagged,
            awaitingPlanApproval: awaitingPlanApproval(openTask),
          });
          // The status caption follows the conversation's language (task 22
          // g/h) — an English thread must not read „შენი პასუხი სჭირდება".
          const lang = result.language ?? 'ka';
          const langLine =
            finalStatus === 'done' ? null : RUN_STRINGS[lang].statusLines[finalStatus];
          void setThreadStatus(userId, threadId, finalStatus, {
            statusLine: langLine,
            // An OPEN goal on this thread is the same fact (ticket 9 task
            // 20 e) — it covers threads whose goal predates the flag being
            // written at creation time.
            ...((becameTask || openTask !== null) && { isTask: true }),
          });
          // Their answer would sit unseen on any device they are not looking
          // at — push it. Which devices those are is decided per subscription
          // inside sendPushNotification (row 6: the gate that used to stand
          // here answered for the person, so one open Mac tab silenced the
          // phone). No-op when VAPID isn't configured. The preview is scrubbed
          // and truncated so no phone number rides in the notification body.
          void sendPushNotification(userId, {
            title: 'Netai — პასუხი მზადაა',
            body: buildPushPreview(result.reply),
            url: `/chat/${threadId}`,
          }).catch(() => undefined);
        })
        .catch(async (error: unknown) => {
          const timedOut = error instanceof Error && error.message === 'RUN_HARD_TIMEOUT';
          // eslint-disable-next-line no-console
          console.error('[POST /threads/:id/message] run failed', error);

          // Timeout with material already gathered → FLUSH it as a partial
          // answer instead of a bare error ("on timeout, deliver what was
          // found + ask გავაგრძელო?" — the spec from the battery runs where
          // the right answer sat in a step while the run died).
          if (timedOut) {
            const partial = await getLongestRunStep(threadId, runId).catch(() => null);
            if (partial !== null && partial.length >= MIN_PARTIAL_FLUSH_CHARS) {
              const reply = `${partial}\n\nამაზე მეტი ვერ მოვასწარი — გავაგრძელო?`;
              emitRunComplete(userId, threadId, runId, { reply });
              void setThreadStatus(userId, threadId, 'needs_you');
              saveThreadMessage(threadId, Number(userId), 'assistant', reply).catch(
                () => undefined,
              );
              return;
            }
          }

          const userMessage = timedOut
            ? 'პასუხის მომზადებას ძალიან დიდი დრო დასჭირდა. გთხოვ, სცადე თავიდან.'
            : 'ტექნიკური შეფერხება მოხდა ჩვენს მხარეს. გთხოვ, სცადე თავიდან.';
          emitRunError(userId, threadId, runId, userMessage);
          void markRunFailed(userId, threadId, detectRunLanguage(message));
          // The SSE event alone is not enough: if the stream dropped mid-run, the
          // user stares at frozen narration forever (three real stalls in one
          // battery run showed no visible timeout). Persist the error INTO the
          // thread — kind='error' so the client renders it as a system failure
          // with a retry, never as words the assistant said. Best-effort.
          // Row 202: with its run id, so a failure can be joined to the run
          // that produced it. Without it the row recording a run's death was
          // the one row that could not be traced back to the run.
          saveThreadMessage(
            threadId,
            Number(userId),
            'assistant',
            userMessage,
            'error',
            runId,
          ).catch(() => undefined);
        })
        // Row 115: released whichever way the run ended, including the failure
        // path above. A claim that survived a failed run would refuse the
        // person's own retry of the message that just failed them — the one
        // moment repeating yourself is certainly deliberate.
        .finally(() => {
          releaseRun(userId, threadId, message, runId);
          endRun(runId);
        });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[POST /threads/:id/message]', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
      }
    }
  },
);

// Rename a conversation (Lika's item 1). The user's own words become the
// title verbatim (trimmed and capped); a rename also wins over any later
// model-generated title, because generateThreadTitle only fires on creation.
const MAX_TITLE_CHARS = 80;
threadsRouter.patch(
  '/:id',
  param('id').isInt({ min: 1 }),
  body('title').isString().trim().isLength({ min: 1, max: MAX_TITLE_CHARS }),
  async (req: Request, res: Response<ApiResponse<unknown>>): Promise<void> => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({ success: false, error: `title: 1–${MAX_TITLE_CHARS} სიმბოლო` });
      return;
    }
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const threadId = Number(req.params.id);
      const thread = await getThread(threadId, userId);
      if (thread === null) {
        res.status(404).json({ success: false, error: 'საუბარი ვერ მოიძებნა' });
        return;
      }
      const title = String((req.body as { title: string }).title).trim();
      await updateThreadTitle(threadId, title);
      emitThreadUpdated(userId, { id: threadId, title });
      res.status(200).json({ success: true, data: { id: threadId, title } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[PATCH /threads/:id]', error);
      res.status(500).json({ success: false, error: 'გადარქმევა ვერ მოხერხდა' });
    }
  },
);

// Delete one conversation (Lika's D23) — pending asks of any task living on
// the thread are cancelled FIRST (recipients get an honest closing note),
// then the thread and everything in it goes in one transaction.
threadsRouter.delete(
  '/:id',
  param('id').isInt({ min: 1 }),
  async (req: Request, res: Response<ApiResponse<unknown>>): Promise<void> => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({ success: false, error: 'არასწორი thread id' });
      return;
    }
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const threadId = Number(req.params.id);
      const thread = await getThread(threadId, userId);
      if (thread === null) {
        res.status(404).json({ success: false, error: 'საუბარი ვერ მოიძებნა' });
        return;
      }
      // tasks.user_id is TEXT — uncast parameter (the ::int cast was one of the
      // three faults behind ticket 5 item A2's 500).
      const openTasks = await query<{ id: number }>(
        `SELECT id FROM tasks WHERE thread_id = $1 AND user_id = $2 AND status = 'open'`,
        [threadId, userId],
      );
      for (const task of openTasks.rows) {
        await cancelAsksForTask(task.id).catch(() => undefined);
      }
      const result = await deleteThread(userId, threadId);
      if (!result.deleted) {
        res.status(404).json({ success: false, error: 'საუბარი ვერ მოიძებნა' });
        return;
      }
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[DELETE /threads/:id]', error);
      res.status(500).json({ success: false, error: 'წაშლა ვერ მოხერხდა' });
    }
  },
);

export default threadsRouter;
