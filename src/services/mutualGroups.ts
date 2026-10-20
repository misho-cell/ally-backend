import { query } from '../db/postgres/client';
import { geoName } from './georgianCase';
import { FoundThroughBridge, knowsLine } from './introTargetSentence';
import { labelNamedIn, latinLabelNamedInGeorgian } from './namedLabel';
import { nameKey } from './tools/transliterate';
import { phoneDigits } from './phone';
import { routeIntroductions } from './planClosedRoute';
import type { RunLanguage } from './runLanguage';
import { AccountDetails, fetchAccountStates, isMemberPhone } from './tools/membership';

/**
 * #6304 (Giorgi, G-077; his OK on the template as written, G-111, 19 Oct): a
 * bridge proposal named one or two people and never the rest of the owner's
 * contacts who know the person sought. The first proposal now lists every one
 * the run found, in two groups — those on Netai, whose assistant is asked
 * directly, and those not on Netai, whom the owner writes to or invites. A
 * group with nobody in it is left out. Names are the owner's own.
 */
const QUERY_TIMEOUT_MS = 5_000;
const MAX_NAMES = 12;
const NAME_SEPARATOR = ', ';

export interface MutualContact {
  readonly name: string;
  readonly onNetai: boolean;
}

interface GroupWords {
  readonly heading: (target: string) => string;
  readonly onNetai: string;
  readonly notOnNetai: string;
}

const WORDS: Readonly<Partial<Record<RunLanguage, GroupWords>>> = {
  ka: {
    heading: (target) => `${geoName(target, 'dat')} იცნობენ შენი ეს ნაცნობები:`,
    onNetai: 'Netai-ზე არიან — მათ ასისტენტს პირდაპირ ვკითხავ',
    notOnNetai: 'Netai-ზე არ არიან — მათ შენ თვითონ მისწერ, ან მოიწვევ',
  },
  en: {
    heading: (target) => `These contacts of yours know ${target}:`,
    onNetai: "On Netai — I'll ask their assistant directly",
    notOnNetai: 'Not on Netai — you write to them yourself, or invite them',
  },
};

/** The two groups as the owner reads them; null when nobody was found or the words are not approved. */
export function mutualGroupsText(
  target: string,
  contacts: readonly MutualContact[],
  language: RunLanguage,
): string | null {
  const words = WORDS[language];
  if (words === undefined || contacts.length === 0) return null;
  const names = (onNetai: boolean): string =>
    contacts
      .filter((c) => c.onNetai === onNetai)
      .map((c) => c.name)
      .join(NAME_SEPARATOR);
  const lines = [
    words.heading(target),
    ...(names(true) !== '' ? [`• ${words.onNetai}: ${names(true)}`] : []),
    ...(names(false) !== '' ? [`• ${words.notOnNetai}: ${names(false)}`] : []),
  ];
  return lines.join('\n');
}

/** The one person the plan's introductions lead to; null when none or several. */
function planTarget(planInput: unknown): string | null {
  const targets = new Set(routeIntroductions(planInput).map((intro) => intro.toName.trim()));
  return targets.size === 1 ? [...targets][0] : null;
}

/** The phones of the people the plan involves, read defensively from the model's input. */
function involvedDigits(planInput: unknown): string[] {
  const people = (planInput as { people_to_involve?: unknown } | null)?.people_to_involve;
  if (!Array.isArray(people)) return [];
  return people
    .map((person: unknown) => (person as { phone?: unknown } | null)?.phone)
    .filter((phone): phone is string => typeof phone === 'string')
    .map(phoneDigits)
    .filter((d) => d !== '');
}

interface PlanReach {
  readonly target: string;
  readonly planned: readonly string[];
  /** A kind of person: everyone of that kind found, rather than the ones named like the target. */
  readonly ofKind?: readonly FoundThroughBridge[];
}

/**
 * The tester's 69335 (#6304, 61547): the plan named Eka and Luka as go-betweens
 * but wrote no introduction field, so no target was known and no groups were
 * drawn. When the search found exactly one person through the plan's own
 * go-betweens, that person is whom they lead to.
 */
function goBetweensTarget(
  planInput: unknown,
  found: readonly FoundThroughBridge[],
): PlanReach | null {
  const involved = involvedDigits(planInput);
  const through = found.filter(
    (person) =>
      person.far !== true &&
      person.viaPhones.some((phone) => involved.includes(phoneDigits(phone))),
  );
  const names = new Set(through.map((person) => person.name.trim()));
  return names.size === 1 ? { target: [...names][0], planned: involved } : null;
}

/**
 * #6304 (box 70023, Misho's yes 20 Oct 17:00Z): an owner asking for a KIND of
 * person — an architect, a tutor — got „<A>-ის და <B>-ის ასისტენტებს
 * დაველაპარაკები", with nobody's who-they-know and no not-on-Netai group,
 * because the search found several people and none is the one target. When
 * every person found through the plan's go-betweens was found by the same
 * search words, those words are what the groups are about.
 */
function kindReach(planInput: unknown, found: readonly FoundThroughBridge[]): PlanReach | null {
  const involved = involvedDigits(planInput);
  const ofKind = found.filter(
    (person) =>
      person.far !== true &&
      person.sought !== undefined &&
      person.viaPhones.some((phone) => involved.includes(phoneDigits(phone))),
  );
  const words = new Set(ofKind.map((person) => (person.sought ?? '').toLowerCase()));
  const sought = ofKind[0]?.sought;
  return words.size === 1 && sought !== undefined
    ? { target: sought, planned: involved, ofKind }
    : null;
}

/** Whom the plan leads to, and its go-betweens: from its introductions, else from the search. */
function planReach(planInput: unknown, found: readonly FoundThroughBridge[]): PlanReach | null {
  const target = planTarget(planInput);
  if (target === null) return goBetweensTarget(planInput, found) ?? kindReach(planInput, found);
  const planned = routeIntroductions(planInput).map((intro) => phoneDigits(intro.viaPhone));
  return { target, planned };
}

async function ownersNames(
  userId: string,
  digits: readonly string[],
): Promise<Map<string, string>> {
  const result = await query<{ digits: string; alias: string }>(
    `SELECT DISTINCT ON (regexp_replace(phone, '\\D', '', 'g'))
            regexp_replace(phone, '\\D', '', 'g') AS digits, TRIM(alias) AS alias
       FROM "UserAlias"
      WHERE "contactId" = $1::int AND regexp_replace(phone, '\\D', '', 'g') = ANY($2::text[])
        AND NULLIF(TRIM(alias), '') IS NOT NULL
      ORDER BY regexp_replace(phone, '\\D', '', 'g'), created_at
      LIMIT $3`,
    [userId, digits, MAX_NAMES],
    QUERY_TIMEOUT_MS,
  );
  return new Map(result.rows.map((r) => [r.digits, r.alias]));
}

/**
 * The tester's 69134 (#6304, 0 of 3): the plan named „ზურაბ კვარაცხელია" and the
 * search had found him as „Zura Kvaratskhelia" (the friends' label), so the exact
 * comparison matched nobody and no group was drawn. One person under two
 * spellings is still one person.
 */
const FIRST_NAME_PREFIX = 3;

/** Same surname and the same start of the first name, read by sound in either script („Zura" / „ზურაბ"). */
function sameNameBySound(a: string, b: string): boolean {
  const [aFirst, ...aRest] = nameKey(a)
    .split(' ')
    .filter((w) => w !== '');
  const [bFirst, ...bRest] = nameKey(b)
    .split(' ')
    .filter((w) => w !== '');
  if (aFirst === undefined || bFirst === undefined || aRest.length === 0 || bRest.length === 0) {
    return false;
  }
  const surname = (words: string[]): string => words[words.length - 1];
  return (
    surname(aRest) === surname(bRest) &&
    aFirst.slice(0, FIRST_NAME_PREFIX) === bFirst.slice(0, FIRST_NAME_PREFIX)
  );
}

export function namesTheTarget(foundName: string, target: string): boolean {
  const a = foundName.trim();
  const b = target.trim();
  return (
    a === b ||
    sameNameBySound(a, b) ||
    labelNamedIn(b, a) ||
    labelNamedIn(a, b) ||
    latinLabelNamedInGeorgian(b, a) ||
    latinLabelNamedInGeorgian(a, b)
  );
}

/** The found people one step away who are the plan's target; the only one found, when none matches by name. */
function foundTarget(
  found: readonly FoundThroughBridge[],
  target: string,
): readonly FoundThroughBridge[] {
  const near = found.filter((person) => person.far !== true);
  const named = near.filter((person) => namesTheTarget(person.name, target));
  if (named.length > 0) return named;
  const distinct = new Set(near.map((person) => person.name.trim()));
  return distinct.size === 1 ? near : [];
}

/**
 * The tester's 69268 (#6304, 0 of 3): a non-member saved in both the owner's and
 * the target's phonebook never showed. The search walks members' books, so a
 * person with no book of their own is never found through it; the target's own
 * book says they know each other. Only non-members are added this way — members
 * who know the target are the search's to find.
 */
async function sharedWithTarget(
  userId: string,
  targetDigits: readonly string[],
): Promise<string[]> {
  const result = await query<{ digits: string }>(
    `WITH target_book AS (
       SELECT DISTINCT regexp_replace(a.phone, '\\D', '', 'g') AS digits
         FROM "UserAlias" a
        WHERE a."contactId" IN (SELECT "userId" FROM "UserPhone"
                                 WHERE regexp_replace(phone, '\\D', '', 'g') = ANY($2::text[]))
     )
     SELECT DISTINCT regexp_replace(o.phone, '\\D', '', 'g') AS digits
       FROM "UserAlias" o
       JOIN target_book t ON t.digits = regexp_replace(o.phone, '\\D', '', 'g')
      WHERE o."contactId" = $1::int AND NOT (t.digits = ANY($2::text[]))
      LIMIT $3`,
    [userId, targetDigits, MAX_NAMES],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => r.digits);
}

/** The target's own phone: the plan's, else the one the search found them by. */
function targetDigits(planInput: unknown, foundTargets: readonly FoundThroughBridge[]): string[] {
  const phones = [
    ...routeIntroductions(planInput).map((intro) => intro.toPhone ?? ''),
    ...foundTargets.map((person) => person.phone ?? ''),
  ];
  return [...new Set(phones.map(phoneDigits))].filter((d) => d !== '');
}

/** The shared contacts not on Netai, after the ones already listed. */
async function sharedNonMembers(
  userId: string,
  target: readonly string[],
  listed: readonly string[],
): Promise<string[]> {
  if (target.length === 0) return [];
  const shared = (await sharedWithTarget(userId, target)).filter((d) => !listed.includes(d));
  if (shared.length === 0) return [];
  const states = await fetchAccountStates(shared);
  return shared.filter((d) => !isMemberPhone(states, d));
}

/** The owner's names, each said once; a name on Netai under any number counts as on Netai. */
function contactsOnce(
  digits: readonly string[],
  names: ReadonlyMap<string, string>,
  states: Map<string, AccountDetails>,
): MutualContact[] {
  const byName = new Map<string, MutualContact>();
  for (const d of digits) {
    const name = names.get(d);
    if (name === undefined) continue;
    const onNetai = isMemberPhone(states, d) || byName.get(name)?.onNetai === true;
    byName.set(name, { name, onNetai });
  }
  return [...byName.values()];
}

/** The plan's go-betweens first, then everyone the run found knowing the target. */
function knownDigits(
  planned: readonly string[],
  foundTargets: readonly FoundThroughBridge[],
): string[] {
  return [
    ...new Set(
      [...planned, ...foundTargets.flatMap((person) => person.viaPhones.map(phoneDigits))].filter(
        (d) => d !== '',
      ),
    ),
  ];
}

/**
 * Every contact of the owner's this run found knowing the plan's one target,
 * grouped — the plan's own go-betweens always among them. With `withReason`
 * (the plan sentence carries no „who knows whom" line, as when two
 * go-betweens are planned), the first one's „<X> <Y>-ს იცნობს." follows the
 * groups: Giorgi's template, one reason sentence for the first bridge.
 */
export async function mutualGroupsFor(
  userId: string,
  planInput: unknown,
  found: readonly FoundThroughBridge[],
  language: RunLanguage,
  withReason = false,
): Promise<string | null> {
  const reach = planReach(planInput, found);
  if (reach === null || WORDS[language] === undefined) return null;
  const { target, planned } = reach;
  const foundTargets = reach.ofKind ?? foundTarget(found, target);
  try {
    const known = knownDigits(planned, foundTargets);
    const shared = await sharedNonMembers(userId, targetDigits(planInput, foundTargets), known);
    const digits = [...known, ...shared].slice(0, MAX_NAMES);
    if (digits.length === 0) return null;
    const [names, states] = await Promise.all([
      ownersNames(userId, digits),
      fetchAccountStates(digits),
    ]);
    const groups = mutualGroupsText(target, contactsOnce(digits, names, states), language);
    const first = names.get(planned.find((d) => names.has(d)) ?? '');
    const reason =
      withReason && language === 'ka' && first !== undefined
        ? knowsLine({ via: first, to: target, knowsThem: true })
        : null;
    return groups === null || reason === null ? groups : `${groups}\n${reason}`;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[mutual-groups] not read:', (err as Error).message);
    return null;
  }
}
