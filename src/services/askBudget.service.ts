import { query } from '../db/postgres/client';

const BUDGET_QUERY_TIMEOUT_MS = 5_000;

// Ticket 6, engine T10: growth-ask budgets & fatigue dials. A "growth ask" is
// a question sent to another member on the sender's behalf (createAsk) — the
// mechanism by which the network grows. The assistant must be physically
// unable to exceed the budget; enforcement lives here, at the same
// server-side choke point as createAsk's own permission gate, not in the
// prompt.

// Fixed by spec ("hard floor: 1") — the per-conversation cap is NOT part of
// the testing ladder, which only steps the monthly dial.
const PER_CONVERSATION_GROWTH_ASK_LIMIT = 1;

// Global config, changeable on Railway without a deploy (spec: "the global
// ladder is a config change, not a deploy"). The ladder may step the monthly
// dial up to 4x its start value; clamped so a bad env value can't disable
// the budget outright.
const MONTHLY_GROWTH_ASK_BUDGET_BASE = Number(process.env.MONTHLY_GROWTH_ASK_BUDGET_BASE ?? 30);
const MONTHLY_GROWTH_ASK_BUDGET_LADDER = Math.min(
  4,
  Math.max(1, Number(process.env.MONTHLY_GROWTH_ASK_BUDGET_LADDER ?? 1)),
);

// Each fatigue signal (a refusal or an ignored ask) removes this many asks
// from the sender's monthly budget for the rest of the month. Env-adjustable
// for the same "config, not deploy" reason as the ladder itself.
const FATIGUE_STEP_DOWN_PER_SIGNAL = Number(process.env.FATIGUE_STEP_DOWN_PER_SIGNAL ?? 5);

// An unanswered ask this old counts as "ignored" for fatigue purposes — much
// longer than taskAsks.service's 48h reminder window, since a reminder is
// routine and a fatigue signal should mean something really isn't landing.
const IGNORED_ASK_AFTER_HOURS = 168;

export type GrowthAskRefusalReason = 'conversation_limit_reached' | 'monthly_budget_reached';

export interface AskBudgetOutcome {
  allowed: boolean;
  reason?: GrowthAskRefusalReason;
}

/**
 * Fatigue signals attributable to this sender: every time one of their own
 * asks made someone opt out (their "stop asking" flag, recorded once per
 * refusal — a second refusal after resuming writes a second row), and every
 * one of their own sent asks that sat unanswered past the ignored window.
 * Live-computed from existing tables — no separate counter to keep in sync.
 */
async function countFatigueSignals(userId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT
       (SELECT COUNT(*) FROM ask_optout_events WHERE user_id = $1::int AND action = 'opt_out') +
       (SELECT COUNT(*) FROM task_asks
          WHERE from_user_id = $1::int AND status = 'sent'
            AND created_at < NOW() - INTERVAL '${IGNORED_ASK_AFTER_HOURS} hours') AS count`,
    [userId],
    BUDGET_QUERY_TIMEOUT_MS,
  );
  return Number(result.rows[0]?.count ?? 0);
}

function monthlyBudgetFor(fatigueSignals: number): number {
  const ladderBudget = MONTHLY_GROWTH_ASK_BUDGET_BASE * MONTHLY_GROWTH_ASK_BUDGET_LADDER;
  return Math.max(0, ladderBudget - fatigueSignals * FATIGUE_STEP_DOWN_PER_SIGNAL);
}

/**
 * Server-side gate for a growth ask. Call before creating it; a relay ask
 * (parentAskId !== undefined at the createAsk call site) is exempt, matching
 * createAsk's own permission-gate exemption — a relay is the RECIPIENT
 * forwarding an already-permitted parent ask with their own consent.
 *
 * threadId scopes the per-conversation floor; pass undefined when the
 * calling surface has no conversation concept (MCP has none today) — the
 * monthly budget still applies there, just not the per-conversation one.
 */
export async function checkAskBudget(
  fromUserId: string,
  threadId: number | undefined,
): Promise<AskBudgetOutcome> {
  if (threadId !== undefined) {
    const inConversation = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM task_asks ta
       JOIN tasks t ON t.id = ta.task_id
       WHERE t.thread_id = $1 AND ta.from_user_id = $2::int AND ta.parent_ask_id IS NULL`,
      [threadId, fromUserId],
      BUDGET_QUERY_TIMEOUT_MS,
    );
    if (Number(inConversation.rows[0]?.count ?? 0) >= PER_CONVERSATION_GROWTH_ASK_LIMIT) {
      return { allowed: false, reason: 'conversation_limit_reached' };
    }
  }

  const sentThisMonth = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM task_asks
     WHERE from_user_id = $1::int AND parent_ask_id IS NULL
       AND created_at > date_trunc('month', NOW())`,
    [fromUserId],
    BUDGET_QUERY_TIMEOUT_MS,
  );
  const fatigueSignals = await countFatigueSignals(fromUserId);
  if (Number(sentThisMonth.rows[0]?.count ?? 0) >= monthlyBudgetFor(fatigueSignals)) {
    return { allowed: false, reason: 'monthly_budget_reached' };
  }

  return { allowed: true };
}
