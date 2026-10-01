import { BridgeNeed } from './bridgePicker';
import { phoneDigits } from './phone';

/**
 * PLATE v301 G4, THE HALF THE MODEL DID NOT DO (the tester's 994).
 *
 * 038a3fa gave ask_contact `need` and `for_phone`, and the very first run on a
 * fresh pair left both out: it found three lawyers through a bridge at
 * 22:26:42, then asked that bridge at 22:28:45 with a question naming the
 * three and no `need`. So the server saw an ordinary question and drew the
 * ordinary buttons.
 *
 * The server already knows what the model was told to pass: the second-degree
 * search it ran in this thread, the words it searched for, and which bridge
 * each person was found through. So it remembers that, per thread, and an ask
 * to one of those bridges carries it when the model did not. Kept in memory:
 * a deploy forgets it, and then the ask simply goes as before.
 */

/** How many threads are remembered at once; the oldest goes first. */
const MAX_THREADS_REMEMBERED = 500;

/** How many bridges one thread remembers. */
const MAX_BRIDGES_PER_THREAD = 50;

const needsByThread = new Map<number, Map<string, BridgeNeed>>();

interface SecondDegreeRow {
  readonly phone?: unknown;
  readonly via_contacts?: unknown;
}

function bridgePhonesOf(row: SecondDegreeRow): string[] {
  if (!Array.isArray(row.via_contacts)) return [];
  return row.via_contacts
    .map((bridge: unknown) =>
      bridge !== null && typeof bridge === 'object' ? (bridge as { phone?: unknown }).phone : null,
    )
    .filter((phone): phone is string => typeof phone === 'string' && phoneDigits(phone) !== '');
}

function rememberThread(threadId: number): Map<string, BridgeNeed> {
  const known = needsByThread.get(threadId);
  if (known) return known;
  if (needsByThread.size >= MAX_THREADS_REMEMBERED) {
    const oldest = needsByThread.keys().next().value;
    if (oldest !== undefined) needsByThread.delete(oldest);
  }
  const fresh = new Map<string, BridgeNeed>();
  needsByThread.set(threadId, fresh);
  return fresh;
}

/** Remembers, for this thread, each bridge a second-degree search found and for what. */
export function noteSecondDegreeResult(threadId: number, need: string, result: unknown): void {
  const words = need.trim();
  if (words === '' || result === null || typeof result !== 'object') return;
  const rows = (result as { results?: unknown }).results;
  if (!Array.isArray(rows)) return;
  const bridges = rememberThread(threadId);
  for (const row of rows as SecondDegreeRow[]) {
    const forPhone = typeof row.phone === 'string' ? row.phone : undefined;
    for (const bridge of bridgePhonesOf(row)) {
      const key = phoneDigits(bridge);
      if (bridges.has(key) || bridges.size >= MAX_BRIDGES_PER_THREAD) continue;
      bridges.set(key, forPhone ? { need: words, forPhone } : { need: words });
    }
  }
}

/** The need a second-degree search in this thread found this bridge for, if any. */
export function rememberedBridgeNeed(
  threadId: number | undefined,
  bridgePhone: string,
): BridgeNeed | undefined {
  if (threadId === undefined) return undefined;
  return needsByThread.get(threadId)?.get(phoneDigits(bridgePhone));
}

/** For tests: forget everything. */
export function forgetBridgeNeeds(): void {
  needsByThread.clear();
}
