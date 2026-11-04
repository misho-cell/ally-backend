import { ownerNamedAGoBetween } from './severalRoutes';

/**
 * #8946 (battery 5 Nov, case 8 run 3): request_introduction went out inside the
 * search run, two minutes before the owner's „მიდი აბა", and the target's
 * number came back before the owner had seen a plan. ask_contact has had its
 * wall since Ticket 19; request_introduction had none.
 *
 * An introduction now goes only on the owner's word: the goal's permission,
 * an approved plan that names this go-between, the owner naming them himself,
 * or a request the go-between is passing on (that one is the asker's, already
 * agreed to by its own owner). Names are matched, not words: no word list.
 */
export interface IntroGateFacts {
  /** The goal's own permission (grant_task_permission, or an approved plan). */
  readonly permissionGranted: boolean;
  /** An approved plan in force names this go-between. */
  readonly approvedPlanNamesThem: boolean;
  /** This run answers a request the owner is passing on (forwardedIntro). */
  readonly passesARequestOn: boolean;
  /** The owner's own lines in this conversation lately, oldest first. */
  readonly ownerLines: readonly string[];
  readonly mediatorName: string;
}

export function introductionMayGo(facts: IntroGateFacts): boolean {
  if (facts.permissionGranted || facts.approvedPlanNamesThem || facts.passesARequestOn) return true;
  const name = facts.mediatorName.trim();
  return name !== '' && facts.ownerLines.some((line) => ownerNamedAGoBetween(line, [name]));
}

/** What the run is told instead of the send. */
export const INTRODUCTION_WAITS_FOR_THE_YES =
  'Not sent: the owner has not said yes to asking this person for an introduction — no ' +
  'approved plan names them and the owner did not name them. Put it to the owner (a plan with ' +
  'this person in people_to_involve), and send only after their yes. Do not tell them it went.';
