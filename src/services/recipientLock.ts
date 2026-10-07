/**
 * 2582 (the MASTER TEST RUN's LM-002): six askers 1.5 s apart → three or four
 * questions reached one person in a day, over the two a day. createAsk counts
 * the person's questions of the last 24 hours, then spends up to fifteen
 * seconds in the editor before its row is written — so six asks that arrive
 * together all count fewer than two. Asks to one number now go one at a time
 * in this process: each counts after the one before it has written its row.
 * One process serves the API; a second would need the same lock in the
 * database.
 */
const NON_DIGIT_RE = /\D/gu;
const tails = new Map<string, Promise<void>>();

/** Runs `work` after every earlier call for the same number has finished. */
export async function oneAtATimeFor<T>(phone: string, work: () => Promise<T>): Promise<T> {
  const key = phone.replace(NON_DIGIT_RE, '');
  const before = tails.get(key) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const mine = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = before.then(() => mine);
  tails.set(key, tail);
  await before;
  try {
    return await work();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}
