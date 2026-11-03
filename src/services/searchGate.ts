/**
 * #8619 retest 3 (the tester's 81742) and Misho, 3 Nov („ლიმიტებში რაც დაგვრჩა
 * ისიც ბარემ დაასრულე"): one answer sent 16 tag searches at once, and under that
 * contention each took 11–26 s, where one alone takes 1–3 s. A run now runs at
 * most a few network searches at the same time; the rest wait their turn, and
 * the search clock (searchClock.ts) starts when a search actually begins.
 */
export const MAX_PARALLEL_SEARCHES_PER_RUN = 6;

interface Gate {
  running: number;
  readonly waiting: Array<() => void>;
}

const gates = new Map<string, Gate>();

function gateFor(key: string): Gate {
  const known = gates.get(key);
  if (known !== undefined) return known;
  const fresh: Gate = { running: 0, waiting: [] };
  gates.set(key, fresh);
  return fresh;
}

/** Waits for a free place; the returned function gives it back. */
export async function enterSearchGate(key: string): Promise<() => void> {
  const gate = gateFor(key);
  if (gate.running >= MAX_PARALLEL_SEARCHES_PER_RUN) {
    await new Promise<void>((resolve) => gate.waiting.push(resolve));
  } else {
    gate.running += 1;
  }
  let left = false;
  return () => {
    if (left) return;
    left = true;
    const next = gate.waiting.shift();
    if (next !== undefined) next();
    else {
      gate.running -= 1;
      if (gate.running === 0) gates.delete(key);
    }
  };
}
