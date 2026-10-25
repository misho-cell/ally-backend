import { query } from '../db/postgres/client';
import { contactInstructionIn } from './instructionUnsent';

/**
 * #5249 (the tester's 68815, round 7): on an incoming INTRODUCTION request the
 * mediator wrote „სანდროს კარგად არ ვიცნობ, დავითს ჰკითხეთ, ის მისი ბიზნეს
 * პარტნიორია." — and the mediator's own run went looking for Davit in the
 * MEDIATOR's network (four searches, then „I can't identify Davit in your
 * network"). The request stayed pending and the owner kept reading „waiting
 * for Nini". That line is the mediator's answer to the request: it points the
 * owner to somebody else, which respond_to_introduction carries back to the
 * owner as a suggestion (5249 part 2). So that run holds only
 * respond_to_introduction — no new words to the model, the other tools are
 * simply not offered (as relayHeld does on an incoming ask, 3731).
 */
const REQUEST_STATE_QUERY_TIMEOUT_MS = 4_000;

export const REQUEST_THREAD_TYPE = 'incoming_request';
export const ANSWER_TOOL_NAME = 'respond_to_introduction';

/** Is this conversation's introduction request still waiting for the mediator? Fails towards false. */
async function requestIsPending(requestId: number): Promise<boolean> {
  try {
    const result = await query<{ pending: boolean }>(
      `SELECT EXISTS (
                SELECT 1 FROM introduction_requests WHERE id = $1 AND status = 'pending'
              ) AS pending`,
      [requestId],
      REQUEST_STATE_QUERY_TIMEOUT_MS,
    );
    return result.rows[0]?.pending === true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[request-referral] request ${requestId}:`, (err as Error).message);
    return false;
  }
}

/**
 * #7230 (the tester's audit, 63402): „გავაცნობ. მიწერე ომიკოს რო ირო გაცნობს
 * ლიკუნას" is a yes with an instruction — „write to Omiko" names who to tell,
 * not who to ask instead — and it was turned into a refusal. A line that says
 * the mediator will introduce, or opens on a yes, is never a redirect.
 */
const SAYS_YES_TO_INTRODUCE =
  /(გავაცნ|გაგაცნ|გაცნობს|დავაკავშირ|დაგაკავშირ|შევაკავშირ|(^|[^\p{L}])(კი|დიახ|ოკ|ოკეი|ok|okay|yes|sure)([^\p{L}]|$))/iu;

/**
 * Tester 75902 (thread 65521, 25 Oct): the go-between wrote the person's number
 * and „ეს გაუზიარე ლაშას და ვოთსაფით მიწეროს" — share this with the asker, let
 * him write on WhatsApp — and it was answered as a refusal. A line that hands a
 * number over is the yes itself, whoever it says to tell.
 */
const HANDS_OVER_A_NUMBER = /\+?\d(?:[\s().-]?\d){6,}/u;

/**
 * True when the mediator's line, on a pending incoming introduction request,
 * tells the owner to ask somebody else: that run answers the request and nothing else.
 */
export async function answersTheRequestOnly(
  threadType: string | undefined,
  requestId: number | null | undefined,
  line: string,
): Promise<boolean> {
  if (threadType !== REQUEST_THREAD_TYPE || requestId === null || requestId === undefined) {
    return false;
  }
  // An order to ask somebody else, not refersSomebody: its recommendation words
  // („დაგაკავშირებ") are how a mediator says yes to an introduction.
  if (
    contactInstructionIn(line) === null ||
    SAYS_YES_TO_INTRODUCE.test(line) ||
    HANDS_OVER_A_NUMBER.test(line)
  ) {
    return false;
  }
  return requestIsPending(requestId);
}
