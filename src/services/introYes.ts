import { pendingIntroInMediatorThread } from './introduction.service';
import { respondToIntroduction } from './tools/respondToIntroduction';
import { isPlainYes } from './plainYes';

export { isPlainYes };

/**
 * D709, the tester's 44194 (helper conversation 42081): after the helper typed
 * „კი" to an open introduction request, the model asked „როგორ გინდა
 * უპასუხო" with six buttons it made up — the „how" question D709 removed —
 * and nothing was accepted. A plain yes to the open request is acted on by the
 * server, the way a tap on a plan's approve button is (row 323); the run is
 * only told it happened.
 */
/** What the run is told once the yes has been recorded. */
export const INTRO_ACCEPTED_BY_YES =
  'The owner just said yes to the open introduction request, and the server has already ' +
  'accepted it and connected the two (D709). Do NOT call respond_to_introduction, do NOT ask ' +
  'how to connect them, and offer no buttons. Reply in ONE short line in the owner’s language: ' +
  'they are connected.';

/**
 * #8912 (a real case, tester 82704): no fixed line says what was done any more,
 * so the run is given it — whose number went to whom, and from where.
 */
export function introAcceptedByYes(whatWasDone: unknown): string {
  if (typeof whatWasDone !== 'string' || whatWasDone.trim() === '') return INTRO_ACCEPTED_BY_YES;
  return (
    `${INTRO_ACCEPTED_BY_YES} What was done in their name, to say in your own words with every ` +
    `name exactly as here: ${whatWasDone.trim()}`
  );
}

/**
 * Accepts the introduction open in this thread when the line is a plain yes.
 * Returns the note for the run, or null when nothing was accepted.
 */
export async function acceptIntroOnYes(
  userId: string,
  threadId: number,
  message: string,
): Promise<string | null> {
  if (!isPlainYes(message)) return null;
  const requestId = await pendingIntroInMediatorThread(userId, threadId);
  if (requestId === null) return null;
  const outcome = (await respondToIntroduction(userId, requestId, true)) as {
    success?: unknown;
    what_was_done?: unknown;
  };
  if (outcome.success !== true) return null;
  // eslint-disable-next-line no-console
  console.log(`[intro] request ${requestId}: accepted on the mediator's yes (D709)`);
  return introAcceptedByYes(outcome.what_was_done);
}
