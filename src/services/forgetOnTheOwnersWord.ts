/**
 * #8521 RETEST (the tester's 80967): „forget that X is an electrician" holds the
 * fact in the owner's own words, so the fact sweep saved it again the minute
 * forget_contact_fact deleted it.
 *
 * #8779 b (rule 36, the founder 4 Nov 19:07): the sweep no longer reads forget
 * words. A conversation where a fact was just deleted or retracted is not swept
 * for a short while — the deleting tool notes it here.
 */
const SWEEP_PAUSE_AFTER_FORGET_MS = 5 * 60_000;
const forgottenAt = new Map<number, number>();

export function noteFactForgotten(threadId: number | undefined, now: number = Date.now()): void {
  if (threadId === undefined) return;
  forgottenAt.set(threadId, now);
}

export function factForgottenRecently(threadId: number, now: number = Date.now()): boolean {
  const at = forgottenAt.get(threadId);
  if (at === undefined) return false;
  if (now - at > SWEEP_PAUSE_AFTER_FORGET_MS) {
    forgottenAt.delete(threadId);
    return false;
  }
  return true;
}
