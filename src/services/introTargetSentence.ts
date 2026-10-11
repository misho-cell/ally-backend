import { geoName } from './georgianCase';
import { routeIntroductions } from './planClosedRoute';
import { RunLanguage } from './runLanguage';

/**
 * 1454 (b), box 53498: when the model's own plan sentence is not clean, the
 * server's D663 sentence stands in — „ლიკა მეხუთის ასისტენტს დაველაპარაკები და
 * შევეცდები, ეს მოვაგვარო." — and the owner is not told whom it is about.
 * D739's own example names the result: „…რომ ბახვამ გაგაცნოთ თამთა". The plan
 * already carries the person to meet (BF, §128: a route's `introduction`), so
 * the server's sentence can name them. New words the owner reads: OFF until
 * Misho's yes on the exact text (NIGHT_QUESTIONS BQ).
 */
export const INTRO_TARGET_SENTENCE_ON = false;

/** A go-between as the plan stores them: name, phone id, whether they can be asked. */
export interface GoBetween {
  readonly name: string;
  readonly phone: string;
  readonly reach?: string;
}

/** An introduction the plan asks for: through whom, and to whom. */
export interface PlannedIntroduction {
  readonly via: string;
  readonly to: string;
}

/** Only a go-between who can be asked: anyone else carries a note the D663 sentence keeps. */
function reachable(person: GoBetween): boolean {
  return person.reach === undefined || person.reach === 'ok';
}

/**
 * The one introduction the plan asks for: exactly one go-between, reachable,
 * and every route's introduction through them naming the same person. Anything
 * else (two go-betweens, two people to meet, none) leaves the D663 sentence.
 */
export function plannedIntroduction(
  planInput: unknown,
  people: readonly GoBetween[],
): PlannedIntroduction | null {
  if (people.length !== 1 || !reachable(people[0])) return null;
  const via = people[0];
  const targets = new Set(
    routeIntroductions(planInput)
      .filter((intro) => intro.viaPhone === via.phone)
      .map((intro) => intro.toName),
  );
  return targets.size === 1 ? { via: via.name, to: [...targets][0] } : null;
}

/** D739's form, in Georgian: „<via-ის> ასისტენტს დაველაპარაკები … რომ <via-მ> გაგაცნოს <to>." */
export function georgianSentence(intro: PlannedIntroduction): string {
  return (
    `${geoName(intro.via, 'gen')} ასისტენტს დაველაპარაკები და შევეცდები მოვაგვარო, ` +
    `რომ ${geoName(intro.via, 'erg')} გაგაცნოს ${intro.to}.`
  );
}

/**
 * The server's plan sentence naming whom the introduction is to, or null to
 * keep the D663 sentence: the switch is off, the plan names no single
 * introduction, or the run is not in Georgian (only the Georgian text was
 * drafted).
 */
export function introTargetSentence(
  planInput: unknown,
  people: readonly GoBetween[],
  language: RunLanguage,
): string | null {
  if (!INTRO_TARGET_SENTENCE_ON || language !== 'ka') return null;
  const intro = plannedIntroduction(planInput, people);
  return intro === null ? null : georgianSentence(intro);
}
