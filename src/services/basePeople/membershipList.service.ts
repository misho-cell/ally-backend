import { query } from '../../db/postgres/client';
import { NamedNumber, phonesByUniqueName } from '../companyBase/phonebookNames';
import { namesOnNumbers } from '../companyBase/phonebookNames.service';
import { addRosterMember, removeRosterMember } from '../roster.service';
import { nameKey } from '../tools/transliterate';
import { MembershipRow, membershipRows, MembershipStatus } from './membershipList';

/**
 * #7758: applies a community's current/former list to its roster. A person is
 * found by their key in the person store, or else by a name exactly one person
 * in the store carries; their number never leaves the server. A current member
 * gets `member_of`; a former one loses it and gets the „(former member)"
 * affiliation. A dry run counts and writes nothing.
 */
const QUERY_TIMEOUT_MS = 10_000;
/** The store holds about 2,600 people; this is a ceiling, not a page. */
const MAX_PEOPLE_READ = 10_000;

export interface MembershipReport {
  readonly dry_run: boolean;
  readonly rows_in_file: number;
  readonly current: number;
  readonly former: number;
  readonly not_found: number;
  /** Of the found, how many by the unique name members saved them under (not in the store). */
  readonly found_by_phonebook_name: number;
  readonly changed: number;
  readonly skipped: Readonly<Record<string, number>>;
}

interface StorePerson {
  readonly person_key: string;
  readonly name: string;
  readonly phone: string;
}

async function storeWithNumbers(): Promise<StorePerson[]> {
  const result = await query<StorePerson>(
    `SELECT person_key, name, phone FROM base_people WHERE phone IS NOT NULL LIMIT $1`,
    [MAX_PEOPLE_READ],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** Pure: each row's number — by key, else by a name one person alone carries. */
export function phoneForRow(row: MembershipRow, people: readonly StorePerson[]): string | null {
  const byKey = people.find((p) => p.person_key === row.personKey);
  if (byKey !== undefined) return byKey.phone;
  if (row.nameKey === '') return null;
  const named = people.filter((p) => nameKey(p.name) === row.nameKey);
  return named.length === 1 ? named[0].phone : null;
}

/**
 * Tester 79008 (#7758): an ex-Axel member was not in the person store, so the
 * list could not mark him former. A row the store cannot place is found by the
 * one number whose roster or phonebook names carry its full name (#6997's
 * rule); two numbers with that name place nobody. Read only when needed.
 */
async function phonebookNumbersWhenNeeded(
  rows: readonly MembershipRow[],
  people: readonly StorePerson[],
): Promise<Map<string, NamedNumber>> {
  const missing = rows.filter((r) => r.nameKey !== '' && phoneForRow(r, people) === null);
  return missing.length === 0 ? new Map() : phonesByUniqueName(await namesOnNumbers());
}

async function apply(
  group: string,
  phone: string,
  status: MembershipStatus,
  curator: string,
): Promise<boolean> {
  if (status === MembershipStatus.Current) {
    return (await addRosterMember(group, phone, curator)).changed;
  }
  const removed = await removeRosterMember(group, phone);
  const marked = await addRosterMember(group, phone, curator, { former: true });
  return removed.changed || marked.changed;
}

export async function applyMembershipList(
  group: string,
  csv: string,
  dryRun: boolean,
  curator: string,
): Promise<MembershipReport> {
  const { rows, skipped } = membershipRows(csv, group);
  const people = await storeWithNumbers();
  const byName = await phonebookNumbersWhenNeeded(rows, people);
  let notFound = 0;
  let changed = 0;
  let byPhonebookName = 0;
  for (const row of rows) {
    const fromStore = phoneForRow(row, people);
    const fromBook = fromStore === null ? (byName.get(row.nameKey)?.phone ?? null) : null;
    if (fromBook !== null) byPhonebookName += 1;
    const phone = fromStore ?? fromBook;
    if (phone === null) {
      notFound += 1;
      continue;
    }
    if (!dryRun && (await apply(group, phone, row.status, curator))) changed += 1;
  }
  return {
    dry_run: dryRun,
    rows_in_file: rows.length + Object.values(skipped).reduce((a, n) => a + n, 0),
    current: rows.filter((r) => r.status === MembershipStatus.Current).length,
    former: rows.filter((r) => r.status === MembershipStatus.Former).length,
    not_found: notFound,
    found_by_phonebook_name: byPhonebookName,
    changed,
    skipped,
  };
}
