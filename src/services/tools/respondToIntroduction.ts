import { IntroChannel, resolveIntroductionRequest } from '../introduction.service';

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
const CHANNEL_REQUIRED =
  'ჯერ ჰკითხე მომხმარებელს, როგორ სურს გაცნობა, და მერე დამიძახე ისევ `channel`-ით. ' +
  'ორი ვარიანტია და არჩევანი მისია: `direct` — ორივე პირდაპირ დაუკავშირდება ერთმანეთს ' +
  'და მეორე მხარეს კონტაქტი გადაეცემა; `via_mediator` — კონტაქტი არავის გადაეცემა და ' +
  'კავშირი მის გავლით გაგრძელდება. present_choices-ით აჩვენე სამი ღილაკი: ' +
  '„პირდაპირ დააკავშირე" / „ჩემი გავლით" / „არა, ამჯერად". ' +
  'თანხმობა ჯერ არ ჩაწერილა — არაფერი დაკარგულა, უბრალოდ ჰკითხე და დამიძახე.';

export async function respondToIntroduction(
  mediatorUserId: string,
  requestId: number,
  accepted: boolean,
  response?: string,
  channel?: IntroChannel,
): Promise<object> {
  if (accepted && channel === undefined) {
    return { success: false, needs_channel: true, error: CHANNEL_REQUIRED };
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
