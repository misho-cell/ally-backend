/**
 * The tester's 47594 (8 Oct): every saved card started its own score and
 * enrichment in the background, with no limit, on the pool the owner's own
 * requests use — a 500-card import queued hundreds of them behind each other
 * and in front of everybody else. They now run two at a time; the rest wait
 * their turn in order. A failure is the task's own to log and never stops the
 * queue.
 */
export const ENRICHMENT_CONCURRENCY = 2;

type Task = () => Promise<void>;

const waiting: Task[] = [];
let running = 0;

function startNext(): void {
  while (running < ENRICHMENT_CONCURRENCY && waiting.length > 0) {
    const task = waiting.shift();
    if (task === undefined) return;
    running++;
    void task()
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[enrichment] queued task failed:', (err as Error).message);
      })
      .finally(() => {
        running--;
        startNext();
      });
  }
}

/** Queues the task; it starts as soon as fewer than two are running. */
export function enqueueEnrichment(task: Task): void {
  waiting.push(task);
  startNext();
}

/** How many tasks wait and run — for a test, or a log line. */
export function enrichmentQueueSize(): { readonly waiting: number; readonly running: number } {
  return { waiting: waiting.length, running };
}
