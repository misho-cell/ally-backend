import { pendingRequestSharingThread } from './sharedRequestThread.service';

/**
 * ROW 305 (b) — WHAT A RUN KNOWS ABOUT THE REQUEST IN ITS CONVERSATION.
 *
 * A request used to be the subject of exactly one kind of thread, so every
 * question about it was asked of the thread's TYPE: `incoming_request` meant
 * „the request this run may answer is the thread's own", anything else meant
 * „the requests waiting elsewhere". D530 puts a follow-up request into the
 * mediator's existing ask thread, an `incoming_ask`, and a type cannot say
 * whether one is attached to it.
 *
 * So it is asked of the thread, by lookup, once per run — and every reader in
 * the prompt build reads the answer from here instead of re-deriving it from
 * the type and getting the shared thread wrong in its own way.
 */
export interface ThreadRequestScope {
  /** The request that is this thread's own subject, or null when there is none. */
  readonly requestId: number | null;
  /**
   * A request is THIS conversation's subject — its own thread, or a pending
   * one sharing an ask thread. Inside it, the request is answered here: it is
   * not delivered again as a separate card, and the requester's other replies
   * are not this conversation's business.
   */
  readonly requestIsHere: boolean;
  /** A pending request shares this ask thread with the ask (row 305 b). */
  readonly sharedWithAsk: boolean;
}

const NO_REQUEST_HERE: ThreadRequestScope = {
  requestId: null,
  requestIsHere: false,
  sharedWithAsk: false,
};

/**
 * The request a run on this thread is about.
 *
 * A failed lookup is NOT caught. Every other read in the prompt build fails
 * the run the same way, and here the alternative is worse than a failed run:
 * „no request here" would load the owner's private context into a reply that
 * may cross to the requester.
 */
export async function requestScopeForRun(
  userId: string,
  threadType: string | undefined,
  introRequestId: number | null | undefined,
  threadId: number | undefined,
): Promise<ThreadRequestScope> {
  if (threadType === 'incoming_request') {
    return { requestId: introRequestId ?? null, requestIsHere: true, sharedWithAsk: false };
  }
  if (threadType !== 'incoming_ask' || threadId === undefined) return NO_REQUEST_HERE;
  const shared = await pendingRequestSharingThread(threadId, userId);
  if (shared === null) return NO_REQUEST_HERE;
  return { requestId: shared, requestIsHere: true, sharedWithAsk: true };
}

/**
 * Tasks, self-notes and the private context only matter in the main chat, not
 * a focused intro-request thread — and in a request thread the reply crosses
 * to ANOTHER user (mediator_response), so the confidential material must not
 * share that context window at all. Code-enforced, not prompt-enforced.
 *
 * Row 305 (b): an ask thread runs with the owner's full memory (D48) — until a
 * request is waiting in it. Then it is a request thread too, and the stricter
 * of the two rules holds until the request is answered.
 */
export function shouldLoadMemory(
  threadType: string | undefined,
  scope: ThreadRequestScope,
): boolean {
  if (scope.sharedWithAsk) return false;
  return threadType !== 'incoming_request' && threadType !== 'outgoing_request';
}

/**
 * The two items one conversation now carries, named apart.
 *
 * The question and the introduction come from the same person about the same
 * goal, so „კი" or „არა" typed on its own fits either one — and answering the
 * wrong one sends a real person's yes to the wrong thing. Each item says which
 * tool answers it; a reply that does not say which is asked about, never
 * guessed.
 */
export function buildTwoItemsSection(askId: number, requestId: number, targetName: string): string {
  return (
    `\n\n## ამ საუბარში ორი რამ ელოდება პასუხს [შიდა: ask_id=${askId}, request_id=${requestId} — ` +
    'მხოლოდ ინსტრუმენტებისთვის, პასუხში არასდროს ახსენო]\n' +
    '1. **კითხვა** (ზემოთ, „შემოსული კითხვა") — პასუხი გადადის send_answer_to_asker-ით.\n' +
    `2. **გაცნობის თხოვნა** — ${targetName}-ზე (ზემოთ, „ამ საუბრის თხოვნა") — პასუხი ` +
    'respond_to_introduction-ით, მისი წესით (დათანხმებისას ჯერ ჰკითხე როგორ დააკავშიროს).\n' +
    '- ორივე ერთი ადამიანისგანაა, ერთ საკითხზე. თუ მომხმარებლის პასუხი ცალსახად ერთს ეხება ' +
    '(ასახელებს სახელს, ადამიანს ან პასუხს კითხვაზე) — მხოლოდ ის გააკეთე.\n' +
    '- თუ არ ჩანს რომელს ეხება — მაგალითად მხოლოდ „კი", „არა", „კარგი" — არცერთი ინსტრუმენტი ' +
    'არ გამოიძახო: ერთი მოკლე ხაზით ჰკითხე, კითხვაზეა თუ გაცნობაზე, ორი ღილაკით.\n' +
    '- ერთზე პასუხი მეორეზე პასუხი არ არის: ერთის გადაცემის შემდეგ მეორე ისევ ღიაა.'
  );
}
