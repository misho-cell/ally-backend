import { query } from '../db/postgres/client';
import { geoName } from './georgianCase';
import { FoundThroughBridge, knowsLine } from './introTargetSentence';
import { labelNamedIn, latinLabelNamedInGeorgian } from './namedLabel';
import { nameKey } from './tools/transliterate';
import { phoneDigits } from './phone';
import { routeIntroductions } from './planClosedRoute';
import type { RunLanguage } from './runLanguage';
import { fetchAccountStates, isMemberPhone } from './tools/membership';

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
  const target = planTarget(planInput);
  if (target === null || WORDS[language] === undefined) return null;
  const planned = routeIntroductions(planInput).map((intro) => phoneDigits(intro.viaPhone));
  const digits = [
    ...new Set(
      [
        ...planned,
        ...foundTarget(found, target).flatMap((person) => person.viaPhones.map(phoneDigits)),
      ].filter((d) => d !== ''),
    ),
  ].slice(0, MAX_NAMES);
  if (digits.length === 0) return null;
  try {
    const [names, states] = await Promise.all([
      ownersNames(userId, digits),
      fetchAccountStates(digits),
    ]);
    const contacts = digits.flatMap((d) => {
      const name = names.get(d);
      return name === undefined ? [] : [{ name, onNetai: isMemberPhone(states, d) }];
    });
    const groups = mutualGroupsText(target, contacts, language);
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
