/**
 * The tester's 47594 (8 Oct): every saved card started its own score and
 * enrichment in the background, with no limit, on the pool the owner's own
 * requests use — a 500-card import queued hundreds of them behind each other
 * and in front of everybody else. They now run a few at a time (two until the launch load, four since); the rest wait
 * their turn in order. A failure is the task's own to log and never stops the
 * queue.
 */
export const ENRICHMENT_CONCURRENCY = 4;

/**
 * The 21 Oct launch (the tester's 60358, F10; Misho's yes to Q7, 15 Oct): a
 * hundred phonebooks of one to three thousand numbers each would queue a model
 * call per new number for hours. One owner's new numbers are enriched up to
 * this many a day; the rest are still saved and scored, and are enriched when
 * someone else saves them or on a later day's import.
 */
export const ENRICHMENTS_PER_OWNER_PER_DAY = 200;
const enrichedToday = new Map<number, { readonly day: string; count: number }>();

/** Whether this owner's next new number may be enriched today; counts it when yes. */
export function takeEnrichmentAllowance(
  ownerId: number,
  today: string = new Date().toISOString().slice(0, 10),
): boolean {
  const seen = enrichedToday.get(ownerId);
  if (seen === undefined || seen.day !== today) {
    enrichedToday.set(ownerId, { day: today, count: 1 });
    return true;
  }
  if (seen.count >= ENRICHMENTS_PER_OWNER_PER_DAY) return false;
  seen.count += 1;
  return true;
}

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

/** Queues the task; it starts as soon as a running one leaves room. */
export function enqueueEnrichment(task: Task): void {
  waiting.push(task);
  startNext();
}

/** How many tasks wait and run — for a test, or a log line. */
export function enrichmentQueueSize(): { readonly waiting: number; readonly running: number } {
  return { waiting: waiting.length, running };
}
