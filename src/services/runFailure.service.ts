import { RUN_STRINGS, RunLanguage } from './runLanguage';
import { threadAwaitsOwner } from './taskStore.service';
import { setThreadStatus } from './threadStatus.service';

/**
 * The badge a thread carries when its run dies (ticket 9 task 20 b).
 *
 * Live on 3 September, thread 9406: at 02:31:13 the wake run registered goal
 * 1519's question through ask_owner_decision — `flagGoal` set the thread to
 * `needs_you`, which was the truth. Six seconds later the same run produced an
 * empty final, and the failure path overwrote that with `failed` —
 * „შეფერხდა — სცადე თავიდან". The thread then sat there for a day telling the
 * founder to retry, while the goal it carries was waiting for his answer.
 *
 * The two facts are not in competition and were never mutually exclusive:
 *  - the run broke, and the user should be able to retry it. That is carried
 *    by the `kind='error'` row persisted INTO the thread, which the client
 *    renders as a system failure with its own retry.
 *  - the thread waits for the user. That is what the badge means, and it is
 *    the only thing the badge means (ticket 8 task 2 b: "`needs_you` marks
 *    exactly the threads that wait on the user").
 *
 * So the failure keeps the message and the question keeps the badge. A broken
 * run is a reason to try again; it is not a reason to hide a standing question
 * from the person it is addressed to.
 */
export async function markRunFailed(
  userId: string,
  threadId: number,
  lang: RunLanguage = 'ka',
): Promise<void> {
  const awaitsOwner = await threadAwaitsOwner(threadId).catch((err: unknown) => {
    // A read that fails must not decide the badge silently: say so, then fall
    // back to the old behaviour (the failure IS real, whatever else is true).
    // eslint-disable-next-line no-console
    console.error(
      `[run-failure] goal check failed for thread ${threadId}:`,
      (err as Error).message,
    );
    return false;
  });
  if (!awaitsOwner) {
    await setThreadStatus(userId, threadId, 'failed', {
      statusLine: RUN_STRINGS[lang].statusLines.failed,
    });
    return;
  }
  await setThreadStatus(userId, threadId, 'needs_you', {
    statusLine: RUN_STRINGS[lang].statusLines.needs_you,
    isTask: true,
  });
}
