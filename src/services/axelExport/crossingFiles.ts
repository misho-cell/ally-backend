import type { CsvValue } from './csv';
import { exportPhoneHash } from './exportHash';
import { labelParts } from './labelParts';
import type { FactRow } from './axelDataB';

/**
 * Parts C and D (across the roster) of the Axel export, built from the
 * contact rows of part B. Pure: every function reads rows already made.
 */
type Row = Record<string, CsvValue>;

const RELATIONSHIP_FIELDS = [
  'relationship',
  'via_warmth',
  'warm',
  'close_contact',
  'tier',
  'legacy_colour',
];

function pick(row: Row, prefix: string): Row {
  const out: Row = { [`${prefix}_label`]: row.label };
  for (const f of RELATIONSHIP_FIELDS) out[`${prefix}_${f}`] = row[f];
  return out;
}

/** C1: for every ordered pair of members where X saved Y, both directions side by side. */
export function memberToMember(contacts: readonly Row[]): Row[] {
  const byPair = new Map<string, Row>();
  for (const c of contacts) {
    if (c.contact_roster_key === '' || c.owner_roster_key === '') continue;
    byPair.set(`${c.owner_roster_key}|${c.contact_roster_key}`, c);
  }
  const out: Row[] = [];
  for (const [key, c] of byPair) {
    const [x, y] = key.split('|');
    const back = byPair.get(`${y}|${x}`);
    out.push({
      member_x_roster_key: x,
      member_y_roster_key: y,
      y_in_x_phonebook: true,
      x_in_y_phonebook: back !== undefined,
      ...pick(c, 'x_saves_y'),
      ...(back ? pick(back, 'y_saves_x') : {}),
    });
  }
  return out;
}

export const MEMBER_TO_MEMBER_COLUMNS = [
  'member_x_roster_key',
  'member_y_roster_key',
  'y_in_x_phonebook',
  'x_in_y_phonebook',
  ...['x_saves_y', 'y_saves_x'].flatMap((p) => [
    `${p}_label`,
    ...RELATIONSHIP_FIELDS.map((f) => `${p}_${f}`),
  ]),
];

/** C2: a contact saved by two or more members — one row per (contact, member). */
export function sharedContacts(contacts: readonly Row[]): Row[] {
  const owners = new Map<string, Row[]>();
  for (const c of contacts) {
    const key = String(c.contact_hash);
    owners.set(key, [...(owners.get(key) ?? []), c]);
  }
  const out: Row[] = [];
  for (const [hash, rows] of owners) {
    const memberKeys = new Set(rows.map((r) => r.owner_roster_key));
    if (memberKeys.size < 2) continue;
    for (const r of rows) {
      out.push({
        contact_hash: hash,
        saved_by_members: memberKeys.size,
        member_roster_key: r.owner_roster_key,
        label: r.label,
        ...Object.fromEntries(RELATIONSHIP_FIELDS.map((f) => [f, r[f]])),
        senior_role: r.senior_role,
      });
    }
  }
  return out;
}

export const SHARED_CONTACT_COLUMNS = [
  'contact_hash',
  'saved_by_members',
  'member_roster_key',
  'label',
  ...RELATIONSHIP_FIELDS,
  'senior_role',
];

function countBy(values: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const v of values) if (v !== '') out.set(v, (out.get(v) ?? 0) + 1);
  return out;
}

const sorted = (m: Map<string, number>): [string, number][] => [...m].sort((a, b) => b[1] - a[1]);

/** D across the roster: tag frequency with the members using each tag. */
export function tagFrequency(contacts: readonly Row[]): Row[] {
  const contactsPerTag = new Map<string, Set<string>>();
  const membersPerTag = new Map<string, Set<string>>();
  for (const c of contacts) {
    for (const tag of String(c.tags).split('; ').filter(Boolean)) {
      contactsPerTag.set(tag, (contactsPerTag.get(tag) ?? new Set()).add(String(c.contact_hash)));
      membersPerTag.set(tag, (membersPerTag.get(tag) ?? new Set()).add(String(c.owner_roster_key)));
    }
  }
  return [...contactsPerTag]
    .map(([tag, set]) => ({
      tag,
      contacts: set.size,
      members_using: membersPerTag.get(tag)?.size ?? 0,
    }))
    .sort((a, b) => b.contacts - a.contacts);
}

/** D: employers named in facts or in label company words, by distinct contacts. */
export function topEmployers(contacts: readonly Row[], facts: readonly FactRow[]): Row[] {
  const byEmployer = new Map<string, Set<string>>();
  const add = (name: string, hash: string): void => {
    const key = name.trim();
    if (key !== '') byEmployer.set(key, (byEmployer.get(key) ?? new Set()).add(hash));
  };
  for (const f of facts)
    if (f.field_type === 'employer') add(f.value, exportPhoneHash(f.contact_digits));
  for (const c of contacts) add(labelParts(String(c.label)).company, String(c.contact_hash));
  return [...byEmployer]
    .map(([employer, set]) => ({ employer, contacts: set.size }))
    .sort((a, b) => b.contacts - a.contacts);
}

/** D: every relationship value the base uses, with counts. */
export function relationshipDistribution(contacts: readonly Row[]): Row[] {
  const out: Row[] = [];
  for (const field of ['relationship', 'tier', 'legacy_colour', 'warm', 'close_contact']) {
    const values = contacts.flatMap((c) => String(c[field] ?? '').split('; '));
    for (const [value, count] of sorted(countBy(values))) out.push({ field, value, count });
  }
  return out;
}

/** D: how many distinct people all phonebooks hold, and how many are saved by 2+, 3+, 5+. */
export function reachSummary(contacts: readonly Row[]): Row[] {
  const members = new Map<string, Set<string>>();
  for (const c of contacts) {
    const key = String(c.contact_hash);
    members.set(key, (members.get(key) ?? new Set()).add(String(c.owner_roster_key)));
  }
  const sizes = [...members.values()].map((s) => s.size);
  return [
    { measure: 'phonebook_rows', value: contacts.length },
    { measure: 'distinct_people', value: members.size },
    { measure: 'saved_by_2_or_more_members', value: sizes.filter((n) => n >= 2).length },
    { measure: 'saved_by_3_or_more_members', value: sizes.filter((n) => n >= 3).length },
    { measure: 'saved_by_5_or_more_members', value: sizes.filter((n) => n >= 5).length },
    {
      measure: 'senior_role_flagged',
      value: contacts.filter((c) => c.senior_role === true).length,
    },
  ];
}
