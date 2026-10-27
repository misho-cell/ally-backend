import { query } from '../../db/postgres/client';
import { csvRecords } from '../axelLoad/axelBasePlan';
import { readRoster } from '../axelExport/axelData';
import { nameKey } from '../tools/transliterate';

/**
 * #6997 (tester 76702): Rustam Akhmetov was found, but `known_by` was empty —
 * his CELA 13 classmate George is AX-028 in the person store, with no number.
 * The Axel members' numbers were to come from the package's hashes, and those
 * stopped matching when the server secret changed (#7525). The roster itself
 * is in the database with every name a member is known by, so an AX- person
 * is matched to the one roster member whose name is theirs. A name that fits
 * two members, or none, is left without a number rather than guessed.
 */
const QUERY_TIMEOUT_MS = 10_000;
const AXEL_KEY_PREFIX = 'AX-';

export interface RosterNameRow {
  readonly personKey: string;
  readonly name: string;
}

export interface RosterCandidate {
  readonly phone: string;
  readonly names: readonly string[];
}

export interface RosterPhonesReport {
  readonly dry_run: boolean;
  readonly in_file: number;
  readonly matched: number;
  readonly ambiguous: number;
  readonly unmatched: number;
  readonly written: number;
}

/** roster_map.csv's Axel people (AX- keys) with the name the package gives them. */
export function axelRosterRows(rosterMapCsv: string): RosterNameRow[] {
  return csvRecords(rosterMapCsv)
    .map((r) => ({ personKey: (r.person_key ?? '').trim(), name: (r.name ?? '').trim() }))
    .filter((r) => r.personKey.startsWith(AXEL_KEY_PREFIX) && r.name !== '');
}

/** Pure: each row's number when exactly one roster member carries that name. */
export function matchByName(
  rows: readonly RosterNameRow[],
  roster: readonly RosterCandidate[],
): { phones: Map<string, string>; ambiguous: number; unmatched: number } {
  const phones = new Map<string, string>();
  let ambiguous = 0;
  let unmatched = 0;
  for (const row of rows) {
    const key = nameKey(row.name);
    const hits = new Set(
      roster.filter((m) => m.names.some((n) => nameKey(n) === key)).map((m) => m.phone),
    );
    if (hits.size === 1) phones.set(row.personKey, [...hits][0]);
    else if (hits.size === 0) unmatched += 1;
    else ambiguous += 1;
  }
  return { phones, ambiguous, unmatched };
}

async function writePhones(phones: ReadonlyMap<string, string>): Promise<number> {
  if (phones.size === 0) return 0;
  const result = await query(
    `UPDATE base_people p SET phone = v.phone, updated_at = NOW()
       FROM unnest($1::text[], $2::text[]) AS v(person_key, phone)
      WHERE p.person_key = v.person_key AND p.phone IS NULL`,
    [[...phones.keys()], [...phones.values()]],
    QUERY_TIMEOUT_MS,
  );
  return result.rowCount ?? 0;
}

/** Fills the AX- people's numbers from the roster by name; a dry run writes nothing. */
export async function fillRosterPhonesByName(
  rosterMapCsv: string,
  dryRun: boolean,
): Promise<RosterPhonesReport> {
  const rows = axelRosterRows(rosterMapCsv);
  const roster = (await readRoster()).map((m) => ({
    phone: m.phone,
    names: [m.name ?? '', ...m.match_names].filter((n) => n.trim() !== ''),
  }));
  const { phones, ambiguous, unmatched } = matchByName(rows, roster);
  return {
    dry_run: dryRun,
    in_file: rows.length,
    matched: phones.size,
    ambiguous,
    unmatched,
    written: dryRun ? 0 : await writePhones(phones),
  };
}
