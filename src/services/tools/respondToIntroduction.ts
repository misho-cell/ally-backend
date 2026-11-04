import { ResolveSource, resolveIntroductionRequest } from '../introduction.service';

/**
 * Chat-tool adapter over the shared resolver: the model answers a request the
 * user decided on in the thread. Same guards, push, thread sync and analytics
 * as the REST accept/decline buttons — only the source label differs.
 *
 * D709 (the founder, 7 Oct): „Yes, connect them" connects them. The person
 * asked no longer chooses HOW — the „with my involvement" option is gone
 * everywhere, and the resolver picks the channel (see channelWhenUnsaid).
 */
/**
 * #8912 (a real case, tester 82704): the go-between was shown only a fixed
 * line, with no word that the number came from his own phonebook, and believed
 * nothing was done. The run now says what was done itself.
 */
const WHAT_WAS_DONE_NOTE =
  'what_was_done is what the server did in the owner’s name. Tell the owner in your own words, ' +
  'in one or two short lines, with every name exactly as written there. Nothing else says it.';

export async function respondToIntroduction(
  mediatorUserId: string,
  requestId: number,
  accepted: boolean,
  response?: string,
  source: ResolveSource = 'chat',
): Promise<object> {
  const outcome = await resolveIntroductionRequest(
    mediatorUserId,
    { requestId },
    accepted ? 'accept' : 'decline',
    { response, source },
  );
  if (!outcome.ok) {
    return { success: false, error: outcome.error ?? 'მოთხოვნა ვერ მოიძებნა' };
  }
  return {
    success: true,
    ...(outcome.already === true && { already_answered: true }),
    ...(outcome.whatWasDone !== undefined && {
      what_was_done: outcome.whatWasDone,
      note: WHAT_WAS_DONE_NOTE,
    }),
  };
}
