import { geoName } from './georgianCase';
import { phoneDigits } from './phone';
import { routeIntroductions } from './planClosedRoute';
import { RunLanguage } from './runLanguage';
import { OwnerTieReason, TIE_NOTE } from './ownerTies';

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
  /** #5479: why the owner is close to them, when they are. */
  readonly tie?: OwnerTieReason;
}

/** An introduction the plan asks for: through whom, and to whom. */
export interface PlannedIntroduction {
  readonly via: string;
  readonly to: string;
  /** The go-between knows the person themself (not through a chain of others). */
  readonly knowsThem?: boolean;
  /** The person's role, only when it may be told as a fact (D449). */
  readonly role?: string;
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
  return targets.size === 1 ? { via: via.name, to: [...targets][0], knowsThem: true } : null;
}

/** D739's form, in Georgian: „<via-ის> ასისტენტს დაველაპარაკები … რომ <via-მ> გაგაცნოს <to>." */
export function georgianSentence(intro: PlannedIntroduction, viaNote = ''): string {
  const via =
    viaNote === '' ? geoName(intro.via, 'gen') : `${geoName(intro.via, 'gen')} ${viaNote}`;
  return (
    `${via} ასისტენტს დაველაპარაკები და შევეცდები მოვაგვარო, ` +
    `რომ ${geoName(intro.via, 'erg')} გაგაცნოს ${intro.to}.`
  );
}

/**
 * #5149 D (Giorgi's OK, 16 Oct, G-065): after the plan sentence, one sentence
 * saying whom the go-between knows — „<X> <Y>-ს იცნობს — <Y> <role>-ია." with a
 * role that may be told as a fact, „<X> <Y>-ს იცნობს." without. Only where the
 * go-between knows them themself: a far chain's first link does not. ON since
 * Misho's yes (17 Oct, 10:20Z).
 */
export const KNOWS_LINE_ON = true;

/** „ნოტარიუსი" → „ნოტარიუსია"; a word not ending in „ი" takes „-ია". */
function isARole(role: string): string {
  return role.endsWith('ი') ? `${role.slice(0, -1)}ია` : `${role}-ია`;
}

/** The sentence saying whom the go-between knows, or null when it does not apply. */
export function knowsLine(intro: PlannedIntroduction, on: boolean = KNOWS_LINE_ON): string | null {
  if (!on || intro.knowsThem !== true) return null;
  const knows = `${intro.via} ${geoName(intro.to, 'dat')} იცნობს`;
  return intro.role === undefined ? `${knows}.` : `${knows} — ${intro.to} ${isARole(intro.role)}.`;
}

/** A person this run's search found one step away, and the contacts who know them. */
export interface FoundThroughBridge {
  readonly name: string;
  readonly viaPhones: readonly string[];
  /** Found past the second circle: the first link does not know them themself. */
  readonly far?: boolean;
  readonly role?: string;
  /** The found person's own phone, when the search returned it (#6304, 69268). */
  readonly phone?: string;
  /** #6304 (70023): the words the search was run with — the kind of person sought. */
  readonly sought?: string;
}

/** Corroborating members a saved role needs before it is told as a fact (D449). */
const ROLE_SOURCES_FOR_A_FACT = 2;

/** The row's role when it may be said as a fact: not a label word, and said by two members. */
function roleToldAsFact(row: {
  jobPosition?: unknown;
  role_source?: unknown;
  role_sources?: unknown;
}): string | undefined {
  const role = typeof row.jobPosition === 'string' ? row.jobPosition.trim() : '';
  if (role === '' || row.role_source === 'label') return undefined;
  const sources = typeof row.role_sources === 'number' ? row.role_sources : null;
  return sources === null || sources >= ROLE_SOURCES_FOR_A_FACT ? role : undefined;
}

const SECOND_DEGREE = 'second_degree';

/** The named second-circle rows of a person-search result, each with its bridges' phones. */
export function foundThroughBridges(result: unknown): FoundThroughBridge[] {
  const rows = (result as { results?: unknown } | null)?.results;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row: unknown) => {
    const r = (row ?? {}) as {
      name?: unknown;
      ownership?: unknown;
      via_contacts?: unknown;
      jobPosition?: unknown;
      role_source?: unknown;
      role_sources?: unknown;
      phone?: unknown;
    };
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (r.ownership !== SECOND_DEGREE || name === '' || !Array.isArray(r.via_contacts)) return [];
    const viaPhones = r.via_contacts
      .map((via: unknown) => (via as { phone?: unknown } | null)?.phone)
      .filter((phone): phone is string => typeof phone === 'string' && phone !== '');
    if (viaPhones.length === 0) return [];
    const role = roleToldAsFact(r);
    const phone = typeof r.phone === 'string' && r.phone !== '' ? r.phone : undefined;
    return [
      {
        name,
        viaPhones,
        ...(role !== undefined && { role }),
        ...(phone !== undefined && { phone }),
      },
    ];
  });
}

/** A person found past the second circle, and the owner's contact their chain starts at. */
export interface FoundFurtherOut {
  readonly name: string;
  readonly firstLinkPhone: string;
}

/**
 * 5347 (the tester's 63867, 0 of 3): the walk found Zurab five hops out and the
 * plan asked the chain's first link, but this sentence named only that link —
 * it knew of people one step away, not further out. Such a person is whom the
 * first link's chain is asked to reach.
 */
export function foundThroughFirstLinks(further: readonly FoundFurtherOut[]): FoundThroughBridge[] {
  return further
    .filter((hit) => hit.name.trim() !== '' && hit.firstLinkPhone !== '')
    .map((hit) => ({ name: hit.name.trim(), viaPhones: [hit.firstLinkPhone], far: true }));
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
  const through = found.filter((person) =>
    person.viaPhones.some((phone) => phoneDigits(phone) === viaDigits),
  );
  const names = new Set(through.map((person) => person.name));
  if (names.size !== 1) return null;
  const to = [...names][0];
  const rows = through.filter((person) => person.name === to);
  const role = rows.find((person) => person.role !== undefined)?.role;
  return {
    via: via.name,
    to,
    knowsThem: rows.every((person) => person.far !== true),
    ...(role !== undefined && { role }),
  };
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
  if (intro === null) return null;
  // #5479 (the tester's 65642): the one-bridge sentence said no reason either.
  const tie = people[0]?.tie;
  const sentence = georgianSentence(intro, tie === undefined ? '' : TIE_NOTE.ka[tie]);
  const knows = knowsLine(intro);
  return knows === null ? sentence : `${sentence} ${knows}`;
}
