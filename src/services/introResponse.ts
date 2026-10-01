import { answerIsTheirOwnWords } from './taskAsks.service';

/**
 * The tester's 992 (F1): the asker read „პასუხი: „კი, პირდაპირ დაგაკავშირებთ
 * X-სთან."" in quotes. The mediator had typed „კი, გავაცნობ." and tapped a
 * button; the quoted sentence was his assistant's. The requester is shown the
 * response as a quotation, so only words the mediator actually typed in this
 * thread travel as one (`answerIsTheirOwnWords`, row 303); anything else goes
 * without a quote, and the accept itself is unchanged.
 */
export async function mediatorsOwnWords(
  threadId: number | undefined,
  response: unknown,
): Promise<string | undefined> {
  if (typeof response !== 'string' || response.trim() === '') return undefined;
  return (await answerIsTheirOwnWords(threadId ?? null, response)) ? response : undefined;
}
