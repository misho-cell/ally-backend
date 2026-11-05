import { ownerNamedAGoBetween } from './severalRoutes';

/**
 * #8946 (battery 5 Nov, case 8 run 3): request_introduction went out inside the
 * search run, before the owner's „მიდი აბა". The retest (tester 82842, thread
 * 80190) found the next hole: the owner wrote „ask Ana if she knows a good
 * architect", Ana answered „I know Levan", and the introduction to Levan went
 * at once — the owner had named Ana to be ASKED, never anybody to be met.
 *
 * An introduction is the owner's yes to meeting a person, so it goes only when:
 *  - the owner named the person to be met (target) in this conversation, or
 *  - an approved plan carries this very introduction (its route names the
 *    target), or
 *  - the owner has written since the latest answer arrived and named the
 *    go-between or approved a plan with them — a yes given to that answer, or
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
  readonly mediatorName: string;
  readonly targetName: string;
}

function namedIn(lines: readonly string[], name: string): boolean {
  const trimmed = name.trim();
  return trimmed !== '' && lines.some((line) => ownerNamedAGoBetween(line, [trimmed]));
}

export function introductionMayGo(facts: IntroGateFacts): boolean {
  if (facts.passesARequestOn || facts.approvedPlanIntroducesThem) return true;
  if (namedIn(facts.ownerLines, facts.targetName)) return true;
  return (
    facts.ownerSpokeSinceTheAnswer &&
    (facts.approvedPlanNamesTheGoBetween || namedIn(facts.ownerLines, facts.mediatorName))
  );
}

/** What the run is told instead of the send. */
export const INTRODUCTION_WAITS_FOR_THE_YES =
  'Not sent: the owner has not said yes to being introduced to this person. Tell them in a ' +
  'line who was found and through whom, and ask whether to ask for the introduction; send ' +
  'it only after their yes. Do not tell them it went.';
