import { csvRecords } from '../axelLoad/axelBasePlan';
import { tokensByPerson } from '../companyBase/companyBasePlan';

/**
 * 6997 — the people the Axel package knows who have no number anywhere (about
 * 580 after v7: CELA fellows abroad, register names, LinkedIn finds), and the
 * ties the package states between people (CELA cohort classmates, same
 * company, EBAN board, „saved in phonebook"). Until now a fact needed a number
 * to sit on, so „someone in transport in Kazakhstan" reached George but never
 * Rustam Akhmetov of TransCaspian Cargo, his CELA cohort-13 classmate.
 *
 * Pure: the package's files become the rows the loader writes. Nothing here
 * reads or writes the database.
 */

const MAX_NAME_CHARS = 200;
const MAX_VALUE_CHARS = 300;
const MAX_SOURCE_CHARS = 500;
const MAX_TIE_CHARS = 200;
const HASH_RE = /^[0-9a-f]{24}$/u;
const HASH_PREFIX = 'hash:';
const NAME_PREFIX = 'name:';
const MEMBER_PREFIX = 'U-';
const MEMBER_ID_RE = /^U-(\d{1,10})$/u;
const CONFIRMED = 'confirmed';

/**
 * Only facts that describe a person's work, study and reach. Phonebook-derived
 * keys (how members saved them, how many did) and the private family key are
 * internal routing, never a fact about the person (README v6, D721).
 */
export const SAYABLE_KEYS: ReadonlySet<string> = new Set([
  'occupation',
  'employer',
  'works_at_company',
  'headline',
  'field',
  'expertise',
  'past_roles',
  'other_role',
  'education',
  'country',
  'cela_role',
  'industry',
  'affiliation',
  'abroad',
  'foreign_reach',
]);

export interface BasePersonRow {
  readonly personKey: string;
  readonly name: string;
}

export interface BaseFactRow {
  readonly personKey: string;
  readonly key: string;
  readonly value: string;
  readonly sourceUrl: string;
  readonly factDate: string;
}

export interface BaseTieRow {
  readonly fromKey: string;
  readonly toKey: string;
  readonly tie: string;
  readonly basis: string;
}

/** How the server finds a person's number, if they have one. */
export interface NumberLead {
  /** The export's number token, when the key is one or the person has a loadable one. */
  readonly token: string | null;
  /** The member's account, when the key names one (U-<id>). */
  readonly memberId: number | null;
}

function cut(value: string | undefined, max: number): string {
  return (value ?? '').trim().slice(0, max);
}

/** A key that is itself a number token: the bare 24-hex form or „hash:<hex>". */
export function tokenOfKey(key: string): string | null {
  const lower = key.toLowerCase();
  const bare = lower.startsWith(HASH_PREFIX) ? lower.slice(HASH_PREFIX.length) : lower;
  return HASH_RE.test(bare) ? bare : null;
}

/** The name a „name:<Name>" key carries, else null. */
export function nameOfKey(key: string): string | null {
  if (!key.startsWith(NAME_PREFIX)) return null;
  const name = cut(key.slice(NAME_PREFIX.length), MAX_NAME_CHARS);
  return name === '' ? null : name;
}

export function memberIdOfKey(key: string): number | null {
  const match = MEMBER_ID_RE.exec(key);
  return match === null ? null : Number(match[1]);
}

/** Every key's lead to a number: its own token, the person's first loadable token, or a member id. */
export function numberLeads(
  keys: readonly string[],
  personNumbersCsv: string,
): Map<string, NumberLead> {
  const tokens = tokensByPerson(personNumbersCsv);
  const out = new Map<string, NumberLead>();
  for (const key of keys) {
    const token = tokenOfKey(key) ?? tokens.get(key)?.[0] ?? null;
    const memberId = key.startsWith(MEMBER_PREFIX) ? memberIdOfKey(key) : null;
    if (token !== null || memberId !== null) out.set(key, { token, memberId });
  }
  return out;
}

/** people.csv („name_latin") and cela_people.csv („name"): one row per key, the first name kept. */
export function personRows(csv: string): BasePersonRow[] {
  const byKey = new Map<string, BasePersonRow>();
  for (const r of csvRecords(csv)) {
    const personKey = cut(r.person_key, MAX_NAME_CHARS);
    const name = cut(r.name_latin || r.name || r.name_georgian, MAX_NAME_CHARS);
    if (personKey === '' || name === '' || byKey.has(personKey)) continue;
    byKey.set(personKey, { personKey, name });
  }
  return [...byKey.values()];
}

/** The confirmed ties, and both ends of each as people (a tie names them). */
export function tieRows(csv: string): { ties: BaseTieRow[]; people: BasePersonRow[] } {
  const ties = new Map<string, BaseTieRow>();
  const people = new Map<string, BasePersonRow>();
  for (const r of csvRecords(csv)) {
    const fromKey = cut(r.from_key, MAX_NAME_CHARS);
    const toKey = cut(r.to_key, MAX_NAME_CHARS);
    const tie = cut(r.tie, MAX_TIE_CHARS);
    if (fromKey === '' || toKey === '' || fromKey === toKey || tie === '') continue;
    if ((r.status ?? '') !== CONFIRMED) continue;
    ties.set(`${fromKey}\u0000${toKey}\u0000${tie}`, {
      fromKey,
      toKey,
      tie,
      basis: cut(r.basis, MAX_SOURCE_CHARS),
    });
    for (const [key, name] of [
      [fromKey, r.from_name],
      [toKey, r.to_name],
    ] as const) {
      const clean = cut(name, MAX_NAME_CHARS);
      if (clean !== '' && !people.has(key)) people.set(key, { personKey: key, name: clean });
    }
  }
  return { ties: [...ties.values()], people: [...people.values()] };
}

/**
 * The confirmed, sayable facts. A „name:<Name>" key brings its person along;
 * any other key needs the person already loaded (the people and ties parts).
 */
export function factRows(csv: string): { facts: BaseFactRow[]; people: BasePersonRow[] } {
  const facts = new Map<string, BaseFactRow>();
  const people = new Map<string, BasePersonRow>();
  for (const r of csvRecords(csv)) {
    const personKey = cut(r.person_key, MAX_NAME_CHARS);
    const key = cut(r.key, MAX_NAME_CHARS);
    const value = cut(r.value, MAX_VALUE_CHARS);
    if (personKey === '' || value === '' || !SAYABLE_KEYS.has(key)) continue;
    if ((r.status ?? '') !== CONFIRMED) continue;
    facts.set(`${personKey}\u0000${key}\u0000${value}`, {
      personKey,
      key,
      value,
      sourceUrl: cut(r.source, MAX_SOURCE_CHARS),
      factDate: cut(r.date, MAX_NAME_CHARS),
    });
    const name = nameOfKey(personKey);
    if (name !== null) people.set(personKey, { personKey, name });
  }
  return { facts: [...facts.values()], people: [...people.values()] };
}
