import { randomUUID } from 'crypto';
import { query } from '../db/postgres/client';
import { runOwnerMessage } from '../api/routes/threads.routes';
import { THREAD_QUEUE_BUDGET_MS, THREAD_QUEUE_POLL_MS } from '../config/runBudgets';
import { RUN_STRINGS, RunLanguage } from './runLanguage';
import { enterThread, threadHolder } from './threadRunQueue';
import { setThreadStatus } from './threadStatus.service';
import { getThread } from './threads.service';
import { checkRunAllowance } from './tokenWallet.service';

/**
 * #8286 / #8284 (Giorgi 3318, thread 70225, 28 Oct): a file sent with no words
 * got only the automatic „I read the file" line and no run. Netai now answers
 * the upload itself, through the same path as a typed message. The file's
 * history event is already in the thread, so the run reads the list from there.
 *
 * The app uploads on Send and then posts the words, if there are any (#2346).
 * So the upload waits a moment first: words that follow start their own run,
 * and the file is answered by that one, never twice.
 */
export const UPLOAD_RUN_PREFIX = 'upload-';
/** Long enough for the words the app sends right after the file to land. */
export const UPLOAD_ALONE_WAIT_MS = 10_000;
const OWN_THREAD_TYPE = 'regular';
const QUERY_TIMEOUT_MS = 5_000;

export enum UploadRunOutcome {
  Started = 'started',
  /** A run already answering here takes the file itself (#1921, lateFiles). */
  RunAlreadyHere = 'run_already_here',
  WordsFollowed = 'words_followed',
  NotOwnThread = 'not_own_thread',
  NoBalance = 'no_balance',
}

/** Whether the owner wrote words in this thread since the upload (not the „📎" line itself). */
export async function wordsSince(
  threadId: number,
  since: Date,
  attachmentLine: string,
): Promise<boolean> {
  const result = await query<{ found: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM conversations
                     WHERE thread_id = $1 AND role = 'user' AND kind = 'message'
                       AND created_at >= $2 AND content <> $3) AS found`,
    [threadId, since, attachmentLine],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.found === true;
}

/** Starts a run for an upload that came with no words. `line` is the stored attachment line. */
export async function answerUploadAlone(
  userId: string,
  threadId: number,
  line: string,
  since: Date,
  language: RunLanguage,
): Promise<UploadRunOutcome> {
  if (threadHolder(threadId) !== undefined) return UploadRunOutcome.RunAlreadyHere;
  if (await wordsSince(threadId, since, line)) return UploadRunOutcome.WordsFollowed;
  const thread = await getThread(threadId, userId);
  if (thread === null || thread.type !== OWN_THREAD_TYPE) return UploadRunOutcome.NotOwnThread;
  if (!(await checkRunAllowance(userId)).allowed) return UploadRunOutcome.NoBalance;

  const runId = `${UPLOAD_RUN_PREFIX}${randomUUID()}`;
  await setThreadStatus(userId, threadId, 'working', {
    statusLine: RUN_STRINGS[language].statusLines.working,
  });
  await enterThread(threadId, runId, THREAD_QUEUE_BUDGET_MS, THREAD_QUEUE_POLL_MS);
  runOwnerMessage({
    userId,
    threadId,
    thread,
    message: line,
    runId,
    asGoal: false,
    storedOnArrival: true,
    inReplyToMessageId: undefined,
    needsTitle: false,
  });
  return UploadRunOutcome.Started;
}

/** The upload route's call: after the wait, answer the file if nothing else will. */
export function answerUploadAloneLater(
  userId: string,
  threadId: number,
  line: string,
  since: Date,
  language: RunLanguage,
): void {
  const timer = setTimeout(() => {
    answerUploadAlone(userId, threadId, line, since, language)
      .then((outcome) => {
        // eslint-disable-next-line no-console
        console.log(`[upload-run] thread ${threadId}: ${outcome}`);
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error(`[upload-run] thread ${threadId}:`, (err as Error).message);
      });
  }, UPLOAD_ALONE_WAIT_MS);
  timer.unref();
}
