import { query } from '../db/postgres/client';
import { deleteThread } from './threads.service';

/**
 * #5415 / G-067 (Giorgi 16 Oct; Misho's own yes 17 Oct, in two steps): the
 * „ძველი მიმოწერა" tab held the outgoing introduction-request threads, and
 * they are deleted. Step one is the fictional test seats only (200 threads,
 * 149 seats, none carrying a live goal); the 52 on real accounts wait for
 * Misho to read their list. A thread a goal still runs in is never touched,
 * and each goes through the same deleteThread the owner's own delete uses.
 */
const QUERY_TIMEOUT_MS = 10_000;
/** Read and deleted at most this many per call; the step is 200. */
export const MAX_THREADS_PER_CALL = 300;

interface OwnedThread {
  readonly id: number;
  readonly user_id: number;
}

export interface OldRequestThreadsDeleted {
  readonly found: number;
  readonly deleted: number;
}

/** Outgoing-request threads on fictional seats with no open or paused goal on them. */
async function testSeatRequestThreads(): Promise<OwnedThread[]> {
  const result = await query<OwnedThread>(
    `SELECT t.id, t.user_id
       FROM threads t JOIN test_seats ts ON ts.user_id = t.user_id
      WHERE t.type = 'outgoing_request'
        AND NOT EXISTS (SELECT 1 FROM tasks k
                         WHERE k.thread_id = t.id AND k.status IN ('open', 'paused'))
      ORDER BY t.id
      LIMIT $1`,
    [MAX_THREADS_PER_CALL],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * Step two (Misho's yes, 17 Oct, after reading the 52 real-account threads):
 * exactly the threads named, each only when it is still an outgoing-request
 * thread with no open or paused goal on it; anything else named is skipped.
 */
async function namedRequestThreads(threadIds: readonly number[]): Promise<OwnedThread[]> {
  const result = await query<OwnedThread>(
    `SELECT t.id, t.user_id FROM threads t
      WHERE t.id = ANY($1::int[]) AND t.type = 'outgoing_request'
        AND NOT EXISTS (SELECT 1 FROM tasks k
                         WHERE k.thread_id = t.id AND k.status IN ('open', 'paused'))
      ORDER BY t.id
      LIMIT $2`,
    [threadIds, MAX_THREADS_PER_CALL],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

async function deleteEach(threads: readonly OwnedThread[]): Promise<OldRequestThreadsDeleted> {
  let deleted = 0;
  for (const thread of threads) {
    const outcome = await deleteThread(String(thread.user_id), thread.id);
    if (outcome.deleted) deleted += 1;
  }
  return { found: threads.length, deleted };
}

/** Step two of G-067: the named threads, deleted one by one. */
export async function deleteNamedRequestThreads(
  threadIds: readonly number[],
): Promise<OldRequestThreadsDeleted> {
  if (threadIds.length === 0 || threadIds.length > MAX_THREADS_PER_CALL)
    return { found: 0, deleted: 0 };
  return deleteEach(await namedRequestThreads(threadIds));
}

/** Step one of G-067: every test seat's outgoing-request thread, deleted one by one. */
export async function deleteTestSeatRequestThreads(): Promise<OldRequestThreadsDeleted> {
  return deleteEach(await testSeatRequestThreads());
}
