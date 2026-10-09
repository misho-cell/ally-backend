import { PoolClient } from 'pg';
import { withTransaction } from '../../db/postgres/client';
import { readPhonebooks, readRoster } from '../axelExport/axelData';
import { exportPhoneHash } from '../axelExport/exportHash';
import { normalizePhone } from '../phone';
import { basePlan, ResearchFact } from './axelBasePlan';

/**
 * 4225 — writes the Axel package's loadable facts onto the numbers they belong
 * to (Misho's yes, 9 Oct; §119 holds the route, the body and the undo).
 *
 * THE NUMBERS NEVER TRAVEL. The package names each number by the export's
 * keyed hash; the server recomputes that hash over the same population the
 * export hashed (the roster and the members' phonebooks) and finds the number
 * itself.
 *
 * ONE SYSTEM SAVER, NEVER A PERSON. Every row is written by SYSTEM_SAVER_ID,
 * private (is_public false), with source „public_research". Nothing here makes
 * a fact public, and the crowd-confirmation passes leave these rows out, so
 * research can never be the second independent saver (46072 part 2).
 *
 * IDEMPOTENT. A number's research rows are replaced whole, inside one
 * transaction: the same file loaded twice doubles nothing, and a changed row
 * replaces the old value.
 */
export const SYSTEM_SAVER_ID = '0';
export const PUBLIC_RESEARCH = 'public_research';

/** The four keys with one row per (number, saver) — the unique index's own list. */
const ONE_PER_SAVER: ReadonlySet<string> = new Set(['occupation', 'employer', 'city', 'industry']);

export interface BaseLoadReport {
  readonly dry_run: boolean;
  readonly numbers_in_file: number;
  readonly numbers_found: number;
  readonly numbers_not_found: number;
  readonly facts_written: number;
  readonly skipped: Readonly<Record<string, number>>;
}

/** export hash → the number as contact_facts keys it, over the export's own population. */
async function numbersByHash(): Promise<Map<string, string>> {
  const roster = await readRoster();
  const ids = roster.map((m) => m.user_id).filter((id): id is number => id !== null);
  const phonebooks = await readPhonebooks(ids);
  const out = new Map<string, string>();
  for (const raw of [...roster.map((m) => m.phone), ...phonebooks.map((r) => r.contact_digits)]) {
    const hash = exportPhoneHash(raw);
    if (hash !== '' && !out.has(hash)) out.set(hash, normalizePhone(raw));
  }
  return out;
}

/** A second value for a one-per-saver key would break the unique index; the first stays. */
function writable(facts: readonly ResearchFact[], skipped: Record<string, number>): ResearchFact[] {
  const seen = new Set<string>();
  return facts.filter((f) => {
    if (!ONE_PER_SAVER.has(f.key)) return true;
    if (seen.has(f.key)) {
      skipped.second_value_for_one_per_saver_key =
        (skipped.second_value_for_one_per_saver_key ?? 0) + 1;
      return false;
    }
    seen.add(f.key);
    return true;
  });
}

async function replaceNumber(
  client: PoolClient,
  phone: string,
  facts: readonly ResearchFact[],
): Promise<number> {
  await client.query(
    `DELETE FROM contact_facts
      WHERE neo4j_contact_id = $1 AND submitted_by_user_id = $2 AND source = $3`,
    [phone, SYSTEM_SAVER_ID, PUBLIC_RESEARCH],
  );
  for (const f of facts) {
    await client.query(
      `INSERT INTO contact_facts
         (neo4j_contact_id, submitted_by_user_id, field_type, value, is_public, source,
          confidence, is_matchable, source_url, fact_date, research_status)
       VALUES ($1, $2, $3, $4, false, $5, 'mentioned', false, $6, $7::date, $8)`,
      [phone, SYSTEM_SAVER_ID, f.key, f.value, PUBLIC_RESEARCH, f.sourceUrl, f.factDate, f.status],
    );
  }
  return facts.length;
}

export async function loadAxelBase(
  personNumbersCsv: string,
  factsCsv: string,
  dryRun: boolean,
): Promise<BaseLoadReport> {
  const plan = basePlan(personNumbersCsv, factsCsv);
  const skipped: Record<string, number> = { ...plan.skipped };
  const numbers = await numbersByHash();
  const targets: { phone: string; facts: ResearchFact[] }[] = [];
  for (const [hash, facts] of plan.byHash) {
    const phone = numbers.get(hash);
    if (phone !== undefined && phone !== '')
      targets.push({ phone, facts: writable(facts, skipped) });
  }
  const written = dryRun
    ? targets.reduce((n, t) => n + t.facts.length, 0)
    : await withTransaction(async (client) => {
        let n = 0;
        for (const t of targets) n += await replaceNumber(client, t.phone, t.facts);
        return n;
      });
  return {
    dry_run: dryRun,
    numbers_in_file: plan.byHash.size,
    numbers_found: targets.length,
    numbers_not_found: plan.byHash.size - targets.length,
    facts_written: written,
    skipped,
  };
}
