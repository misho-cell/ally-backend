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

/** Step one of G-067: every test seat's outgoing-request thread, deleted one by one. */
export async function deleteTestSeatRequestThreads(): Promise<OldRequestThreadsDeleted> {
  const threads = await testSeatRequestThreads();
  let deleted = 0;
  for (const thread of threads) {
    const outcome = await deleteThread(String(thread.user_id), thread.id);
    if (outcome.deleted) deleted += 1;
  }
  return { found: threads.length, deleted };
}
