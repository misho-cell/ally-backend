import { query } from '../db/postgres/client';
import { netaiMember } from './netaiMembership';

/**
 * #7827 (M6, founder 26 Oct): since #7235 (22 Oct) no new ask goes to someone
 * who never typed in Netai, but the asks sent before that rule still sit open
 * on such people — 135 of them on 84 people on 25 Oct, three on one account
 * (Levan's airport ask among them). They can never be answered, and the goals
 * behind them wait on them.
 *
 * This finds them, and on a real run withdraws them (status „cancelled"), so
 * each goal's next wake sees no open ask there and takes another route. A
 * withdrawal writes live data on real accounts: it runs only on Misho's word,
 * after a dry run. Nothing is said to anyone here.
 */
const SWEEP_TIMEOUT_MS = 15_000;
/** Far above the 135 found; a bound, so a wrong rule cannot touch the whole table. */
const MAX_WITHDRAWN = 1_000;

export interface NonMemberAskReport {
  readonly dry_run: boolean;
  readonly open_asks: number;
  readonly people: number;
  readonly goals: number;
  readonly withdrawn: number;
}

const OPEN_ON_NON_MEMBERS = `
  SELECT ta.id, ta.to_user_id, ta.task_id FROM task_asks ta
    JOIN "User" u ON u.id = ta.to_user_id
   WHERE ta.status = 'sent' AND NOT ${netaiMember('u')}
   LIMIT $1`;

interface OpenAsk {
  readonly id: number;
  readonly to_user_id: number;
  readonly task_id: number;
}

async function openAsksOnNonMembers(): Promise<OpenAsk[]> {
  const result = await query<OpenAsk>(OPEN_ON_NON_MEMBERS, [MAX_WITHDRAWN], SWEEP_TIMEOUT_MS);
  return result.rows;
}

async function withdraw(ids: readonly number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await query(
    `UPDATE task_asks SET status = 'cancelled' WHERE id = ANY($1::int[]) AND status = 'sent'`,
    [[...ids]],
    SWEEP_TIMEOUT_MS,
  );
  return result.rowCount ?? 0;
}

export async function withdrawAsksOnNonMembers(dryRun: boolean): Promise<NonMemberAskReport> {
  const open = await openAsksOnNonMembers();
  const withdrawn = dryRun ? 0 : await withdraw(open.map((a) => a.id));
  return {
    dry_run: dryRun,
    open_asks: open.length,
    people: new Set(open.map((a) => a.to_user_id)).size,
    goals: new Set(open.map((a) => a.task_id)).size,
    withdrawn,
  };
}
