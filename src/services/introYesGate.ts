import { georgianScriptName } from './georgianScriptName';
import { ownerNamedAGoBetween } from './severalRoutes';

/**
 * #8946 (battery 5 Nov, case 8 run 3): request_introduction went out inside the
 * search run, before the owner's „მიდი აბა". The retest (tester 82842, thread
 * 80190) found the next hole: the owner wrote „ask Ana if she knows a good
 * architect", Ana answered „I know Levan", and the introduction to Levan went
 * at once — the owner had named Ana to be ASKED, never anybody to be met.
 *
 * An introduction is the owner's yes to meeting a person, so it goes only when:
 *  - the owner named the person to be met (target) AND the go-between — either
 *    in his own lines or in the reply he was answering (tester's report 8 Nov,
 *    C4: „I want to meet Zura" sent the request through Irakli, a go-between
 *    the owner had never heard of), or
 *  - an approved plan carries this very introduction (its route names the
 *    target), or
 *  - an approved plan asks this go-between (the owner's delegation, Misho
 *    5 Nov), or the owner has written since the latest answer arrived and
 *    named the go-between — a yes given to that answer, or
 *  - it passes on a request the go-between was asked (the asker's own).
 * Names are matched, not words: no word list.
 */
export interface IntroGateFacts {
  /** This run answers a request the owner is passing on (forwardedIntro). */
  readonly passesARequestOn: boolean;
  /** An approved plan in force has a route introducing this target. */
  readonly approvedPlanIntroducesThem: boolean;
  /** An approved plan in force names this go-between. */
  readonly approvedPlanNamesTheGoBetween: boolean;
  /** The owner has written in this conversation since the latest answer arrived. */
  readonly ownerSpokeSinceTheAnswer: boolean;
  /** The owner's own lines in this conversation lately, oldest first. */
  readonly ownerLines: readonly string[];
  /** The assistant's reply the owner's latest line answered ('' when none). */
  readonly replyTheOwnerAnswered: string;
  readonly mediatorName: string;
  readonly targetName: string;
}

/** A name saved in Latin letters („Ana Lomidze") is matched in Georgian lines too. */
function namedIn(lines: readonly string[], name: string): boolean {
  const trimmed = name.trim();
  if (trimmed === '') return false;
  const spellings = [trimmed, georgianScriptName(trimmed)];
  return lines.some((line) => ownerNamedAGoBetween(line, spellings));
}

/**
 * Misho, 5 Nov 11:10Z (autonomy plan, stage 1): an approved plan is the owner's
 * delegation, and it covers an introduction too. When a person the approved plan
 * asks names somebody, the introduction through them goes without asking again.
 */
export function introductionMayGo(facts: IntroGateFacts): boolean {
  if (facts.passesARequestOn || facts.approvedPlanIntroducesThem) return true;
  if (facts.approvedPlanNamesTheGoBetween) return true;
  const routeKnown =
    namedIn(facts.ownerLines, facts.mediatorName) ||
    namedIn([facts.replyTheOwnerAnswered], facts.mediatorName);
  if (namedIn(facts.ownerLines, facts.targetName) && routeKnown) return true;
  return facts.ownerSpokeSinceTheAnswer && namedIn(facts.ownerLines, facts.mediatorName);
}

/** What the run is told instead of the send. */
export const INTRODUCTION_WAITS_FOR_THE_YES =
  'Not sent: the owner has not said yes to being introduced to this person. Tell them in a ' +
  'line who was found and through whom, and ask whether to ask for the introduction; send ' +
  'it only after their yes. Do not tell them it went.';

/**
 * K9 B5 (autonomy stage 1): under an approved plan this refusal fires only for a
 * go-between outside the plan. The plan does not stop: the next step goes on, and
 * the introduction is asked about once, beside it.
 */
export const INTRODUCTION_OUTSIDE_THE_PLAN =
  'Not sent: this go-between is not in the approved plan, so this introduction is outside it. ' +
  'Go on with the plan’s next step now; tell the owner in one line who was found and through ' +
  'whom, and ask once whether to add the introduction. Do not tell them it went.';

export function introductionWaitsLine(planApproved: boolean): string {
  return planApproved ? INTRODUCTION_OUTSIDE_THE_PLAN : INTRODUCTION_WAITS_FOR_THE_YES;
}
