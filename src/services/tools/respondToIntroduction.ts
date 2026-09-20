import { IntroChannel, resolveIntroductionRequest } from '../introduction.service';
import { introChannelRequired } from '../introOpening';
import { RunLanguage } from '../runLanguage';
import { userLanguage } from '../threads.service';

/**
 * Chat-tool adapter over the shared resolver: the model answers a request the
 * user decided on in the thread. Same guards, push, thread sync and analytics
 * as the REST accept/decline buttons — only the source label differs.
 */
/**
 * Item 5 — an accept must say HOW, and the refusal is the point.
 *
 * Misho's design, 20 September: when the assistant asks a mediator to connect
 * two people it also asks, up front, whether the two are put in touch directly
 * or whether it keeps going through them. The mediator chooses.
 *
 * SO AN ACCEPT WITHOUT A CHANNEL IS REFUSED rather than defaulted. Defaulting
 * would mean handing over somebody's phone number because nobody was asked —
 * which is exactly the arrangement this exists to end, and it would do it
 * silently, which is worse. The refusal names both options and the buttons to
 * offer, so one retry fixes it: row 215's rule, that a refusal must name the
 * way forward rather than be a wall.
 *
 * A DECLINE needs no channel. There is nothing to arrange.
 */
export async function respondToIntroduction(
  mediatorUserId: string,
  requestId: number,
  accepted: boolean,
  response?: string,
  channel?: IntroChannel,
): Promise<object> {
  if (accepted && channel === undefined) {
    // The MEDIATOR's language: this refusal names the three button labels the
    // model must put on their screen, and they are the ones choosing whether
    // somebody's phone number is handed over. See introChannelRequired.
    const language = await userLanguage(mediatorUserId).catch(() => 'ka' as RunLanguage);
    return { success: false, needs_channel: true, error: introChannelRequired(language) };
  }
  const outcome = await resolveIntroductionRequest(
    mediatorUserId,
    { requestId },
    accepted ? 'accept' : 'decline',
    { response, source: 'chat', ...(channel !== undefined && { channel }) },
  );
  if (!outcome.ok) {
    return { success: false, error: outcome.error ?? 'მოთხოვნა ვერ მოიძებნა' };
  }
  return { success: true, ...(outcome.already === true && { already_answered: true }) };
}
