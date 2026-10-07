import { pendingIntroInMediatorThread } from './introduction.service';
import { respondToIntroduction } from './tools/respondToIntroduction';

/**
 * D709, the tester's 44194 (helper conversation 42081): after the helper typed
 * „კი" to an open introduction request, the model asked „როგორ გინდა
 * უპასუხო" with six buttons it made up — the „how" question D709 removed —
 * and nothing was accepted. A plain yes to the open request is acted on by the
 * server, the way a tap on a plan's approve button is (row 323); the run is
 * only told it happened.
 */
const PLAIN_YES_RE =
  /^\s*(?:კი|დიახ|ხო|yes|yeah|ok|okay|да|sí)(?:[\s,!.]+(?:დააკავშირე|დაგაკავშირებ|გაგაცნობ|connect them|i'?ll connect you|свяжи их|conéctalos))?[\s!.]*$/iu;

export function isPlainYes(message: string): boolean {
  return PLAIN_YES_RE.test(message);
}

/** What the run is told once the yes has been recorded. */
export const INTRO_ACCEPTED_BY_YES =
  'The owner just said yes to the open introduction request, and the server has already ' +
  'accepted it and connected the two (D709). Do NOT call respond_to_introduction, do NOT ask ' +
  'how to connect them, and offer no buttons. Reply in ONE short line in the owner’s language: ' +
  'they are connected.';

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
  const outcome = (await respondToIntroduction(userId, requestId, true)) as { success?: unknown };
  if (outcome.success !== true) return null;
  // eslint-disable-next-line no-console
  console.log(`[intro] request ${requestId}: accepted on the mediator's yes (D709)`);
  return INTRO_ACCEPTED_BY_YES;
}
