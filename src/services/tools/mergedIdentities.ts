import { query } from '../../db/postgres/client';
import { normalizePhone } from '../phone';

/**
 * Ticket 16 Task 23 (D35, D97): after the review, a pair marked „one person"
 * appears ONCE in search.
 *
 * The merge itself has existed since Ticket 9 — an approved candidate writes
 * both numbers into `person_identities` under one `person_id`, and unmerge
 * deletes those rows. What never existed is the half that shows: identity.ts
 * said in so many words „NO read path consumes person_identities yet". So the
 * founder's and Lika's 78 „yes" answers changed a table nobody read, and one
 * man with two numbers still came back as two rows.
 *
 * This is that read path, applied at the end of every search: rows whose
 * numbers belong to one person collapse into the FIRST of them — callers rank
 * before they call, so the first row is the best one — and it carries
 * `also_known_numbers`, a count. Never the other numbers: the assistant may
 * not see a number it was not given, and a count is all it needs to say „he
 * has another number on file". Undo is automatic: unmerge deletes the rows
 * this reads, so the two people separate again on the next search.
 *
 * A number nobody merged is untouched, so a search over unmerged data costs
 * one indexed lookup and changes nothing.
 */

const MERGE_LOOKUP_TIMEOUT_MS = 5_000;
// The kill switch, for the one case this is wrong: set it and every search
// goes back to one row per number without a deploy.
const MERGED_READS_OFF = process.env.IDENTITY_MERGED_READS === 'off';

export interface MergeablePhoneRow {
  phone?: unknown;
  [key: string]: unknown;
}

/**
 * person_id per phone, for the phones that have one. Phones nobody merged are
 * simply absent from the map.
 */
export async function personIdsForPhones(phones: readonly string[]): Promise<Map<string, string>> {
  const wanted = Array.from(new Set(phones.filter((p) => p !== '')));
  if (wanted.length === 0) return new Map();
  const result = await query<{ phone: string; person_id: string }>(
    `SELECT phone, person_id FROM person_identities WHERE phone = ANY($1::text[])`,
    [wanted],
    MERGE_LOOKUP_TIMEOUT_MS,
  );
  return new Map(result.rows.map((r) => [normalizePhone(r.phone), r.person_id]));
}

export interface CollapseOutcome<T> {
  rows: T[];
  /** How many rows were folded away — 0 means the page is untouched. */
  collapsed: number;
}

/**
 * Collapse rows that are one person into the first of them. Order is kept, so
 * whatever ranking the caller applied still holds.
 */
export async function collapseMergedPhones<T extends MergeablePhoneRow>(
  rows: T[],
): Promise<CollapseOutcome<T>> {
  if (MERGED_READS_OFF || rows.length < 2) return { rows, collapsed: 0 };
  const phoneOf = (row: T): string =>
    typeof row.phone === 'string' ? normalizePhone(row.phone) : '';
  try {
    const byPhone = await personIdsForPhones(rows.map(phoneOf));
    if (byPhone.size === 0) return { rows, collapsed: 0 };

    const keptByPerson = new Map<string, T>();
    const out: T[] = [];
    let collapsed = 0;
    for (const row of rows) {
      const personId = byPhone.get(phoneOf(row));
      if (personId === undefined) {
        out.push(row);
        continue;
      }
      const kept = keptByPerson.get(personId);
      if (kept === undefined) {
        keptByPerson.set(personId, row);
        out.push(row);
        continue;
      }
      // The same person, a second number. The count goes up; the number does
      // not travel — the assistant may never see one it was not handed.
      const marks = kept as MergeablePhoneRow;
      marks.also_known_numbers = Number(marks.also_known_numbers ?? 0) + 1;
      marks.same_person_note =
        'This person has another number on file, already counted here — never two rows, never ask which one is meant.';
      collapsed += 1;
    }
    return { rows: out, collapsed };
  } catch (err) {
    // A search must never fail because the merge table could not be read.
    // eslint-disable-next-line no-console
    console.error('[identity-merge] collapse failed:', (err as Error).message);
    return { rows, collapsed: 0 };
  }
}
