import { query } from '../db/postgres/client';

/**
 * The human yes/no at the end of the target list (tasks 1–10).
 *
 * The criteria document ends on the one case no formula reaches: the founder's
 * wife is the №1 candidate by every machine signal there is — 2,128 contacts,
 * 28 opens, a real title, 65 phonebooks — and she is his wife. Family,
 * friendship and the private reasons a person is the wrong person to approach
 * are nowhere in this schema and never will be.
 *
 * So the list ends with a two-second human answer, and this module is where it
 * is written down and read back.
 */

const DECISION_QUERY_TIMEOUT_MS = 10_000;
/** One paste of a reviewed spreadsheet. Larger than the list will ever be. */
const MAX_DECISIONS = 500;

export type TargetVerdict = 'yes' | 'no';

/** The words a person actually types for yes and no, in both languages. */
const YES_WORDS = ['yes', 'y', 'კი', 'დიახ', 'true', '1', '+'];
const NO_WORDS = ['no', 'n', 'არა', 'false', '0', '-'];

export interface TargetDecisionInput {
  phone?: unknown;
  decision?: unknown;
  note?: unknown;
}

export interface TargetDecision {
  phone: string;
  decision: TargetVerdict;
  note: string | null;
  decided_by: string;
  updated_at: string;
}

export interface ApplyResult {
  approved: number;
  rejected: number;
  /** Rows left untouched, with the reason — never guessed at. */
  skipped: number;
  errors: string[];
}

/**
 * Read one cell of the reviewed spreadsheet.
 *
 * Anything that is neither yes nor no is REFUSED, not interpreted. A
 * mis-parsed „maybe" that lands as „no" deletes a person from every future
 * list without anyone noticing — the same failure mode the identity queue
 * already guards against.
 */
function verdictOf(raw: unknown): TargetVerdict | null {
  const word = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (YES_WORDS.includes(word)) return 'yes';
  if (NO_WORDS.includes(word)) return 'no';
  return null;
}

/** The founder's answers, loaded back. A second thought replaces the first. */
export async function applyTargetDecisions(
  decisions: readonly TargetDecisionInput[],
  actor: string,
): Promise<ApplyResult> {
  const out: ApplyResult = { approved: 0, rejected: 0, skipped: 0, errors: [] };
  if (decisions.length > MAX_DECISIONS) {
    out.errors.push(`ერთ ჯერზე მაქსიმუმ ${MAX_DECISIONS} გადაწყვეტილება`);
    return out;
  }
  for (const row of decisions) {
    const phone = String(row.phone ?? '').trim();
    const verdict = verdictOf(row.decision);
    if (phone === '') {
      out.skipped += 1;
      out.errors.push('ნომრის გარეშე სტრიქონი გამოტოვებულია');
      continue;
    }
    if (verdict === null) {
      // The commonest case by far: an untouched row in the spreadsheet.
      out.skipped += 1;
      continue;
    }
    const note = String(row.note ?? '').trim();
    await query(
      `INSERT INTO target_decisions (phone, decision, note, decided_by)
       VALUES ($1, $2, NULLIF($3, ''), $4)
       ON CONFLICT (phone) DO UPDATE
         SET decision = EXCLUDED.decision,
             note = COALESCE(EXCLUDED.note, target_decisions.note),
             decided_by = EXCLUDED.decided_by,
             updated_at = NOW()`,
      [phone, verdict, note, actor],
      DECISION_QUERY_TIMEOUT_MS,
    );
    if (verdict === 'yes') out.approved += 1;
    else out.rejected += 1;
  }
  return out;
}

/**
 * The phones a human has ruled out. Read once per build and applied as a gate,
 * so a „no" removes a person the same way a hotline is removed — and is
 * counted in the same ledger, so the founder can see what his own rulings cost.
 */
export async function refusedTargetPhones(): Promise<Set<string>> {
  const result = await query<{ phone: string }>(
    `SELECT phone FROM target_decisions WHERE decision = 'no'`,
    [],
    DECISION_QUERY_TIMEOUT_MS,
  );
  return new Set(result.rows.map((r) => r.phone));
}

/**
 * Take a standing answer back.
 *
 * A review loop without an undo is a trap: the founder marks somebody „არა"
 * by mistake and the only recovery documented anywhere is hand-written SQL.
 * Returns whether a row was actually removed, so a typo in the phone reads as
 * „nothing happened" rather than as success.
 */
export async function clearTargetDecision(phone: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM target_decisions WHERE phone = $1`,
    [phone.trim()],
    DECISION_QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

/** Every standing answer, newest first — the audit of who decided what. */
export async function listTargetDecisions(): Promise<TargetDecision[]> {
  const result = await query<TargetDecision & { updated_at: Date | string }>(
    `SELECT phone, decision, note, decided_by, updated_at
     FROM target_decisions
     ORDER BY updated_at DESC`,
    [],
    DECISION_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((row) => ({
    ...row,
    updated_at: new Date(row.updated_at).toISOString(),
  }));
}
