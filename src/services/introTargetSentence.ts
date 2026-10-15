import { geoName } from './georgianCase';
import { phoneDigits } from './phone';
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
export const INTRO_TARGET_SENTENCE_ON = true;

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

/** A person this run's search found one step away, and the contacts who know them. */
export interface FoundThroughBridge {
  readonly name: string;
  readonly viaPhones: readonly string[];
}

const SECOND_DEGREE = 'second_degree';

/** The named second-circle rows of a person-search result, each with its bridges' phones. */
export function foundThroughBridges(result: unknown): FoundThroughBridge[] {
  const rows = (result as { results?: unknown } | null)?.results;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row: unknown) => {
    const r = (row ?? {}) as { name?: unknown; ownership?: unknown; via_contacts?: unknown };
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (r.ownership !== SECOND_DEGREE || name === '' || !Array.isArray(r.via_contacts)) return [];
    const viaPhones = r.via_contacts
      .map((via: unknown) => (via as { phone?: unknown } | null)?.phone)
      .filter((phone): phone is string => typeof phone === 'string' && phone !== '');
    return viaPhones.length === 0 ? [] : [{ name, viaPhones }];
  });
}

/**
 * 4297 [c]/[d] (the tester's 59902): the plan named one go-between and no
 * introduction, so the D663 sentence named only the go-between and never the
 * lawyer the search had found through them. When this run's search found
 * exactly one named person through that same go-between, that person is whom
 * the go-between is asked to introduce.
 */
export function introductionFromFound(
  people: readonly GoBetween[],
  found: readonly FoundThroughBridge[],
): PlannedIntroduction | null {
  if (people.length !== 1 || !reachable(people[0])) return null;
  const via = people[0];
  const viaDigits = phoneDigits(via.phone);
  if (viaDigits === '') return null;
  const names = new Set(
    found
      .filter((person) => person.viaPhones.some((phone) => phoneDigits(phone) === viaDigits))
      .map((person) => person.name),
  );
  return names.size === 1 ? { via: via.name, to: [...names][0] } : null;
}

/**
 * The server's plan sentence naming whom the introduction is to, or null to
 * keep the D663 sentence: the switch is off, neither the plan nor this run's
 * search names a single introduction, or the run is not in Georgian (only the
 * Georgian text was drafted).
 */
export function introTargetSentence(
  planInput: unknown,
  people: readonly GoBetween[],
  language: RunLanguage,
  found: readonly FoundThroughBridge[] = [],
): string | null {
  if (!INTRO_TARGET_SENTENCE_ON || language !== 'ka') return null;
  const intro = plannedIntroduction(planInput, people) ?? introductionFromFound(people, found);
  return intro === null ? null : georgianSentence(intro);
}
