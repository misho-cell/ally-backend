import { resolveIntroductionRequest } from '../introduction.service';

/**
 * Chat-tool adapter over the shared resolver: the model answers a request the
 * user decided on in the thread. Same guards, push, thread sync and analytics
 * as the REST accept/decline buttons — only the source label differs.
 */
export async function respondToIntroduction(
  mediatorUserId: string,
  requestId: number,
  accepted: boolean,
  response?: string,
): Promise<object> {
  const outcome = await resolveIntroductionRequest(
    mediatorUserId,
    { requestId },
    accepted ? 'accept' : 'decline',
    { response, source: 'chat' },
  );
  if (!outcome.ok) {
    return { success: false, error: outcome.error ?? 'მოთხოვნა ვერ მოიძებნა' };
  }
  return { success: true, ...(outcome.already === true && { already_answered: true }) };
}
