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
// Exported for T7's capacity read (list size "driven by ask capacity... under
// T10 budgets") — it must use the exact same numbers, not a re-guessed copy.
export const MONTHLY_GROWTH_ASK_BUDGET_BASE = Number(
  process.env.MONTHLY_GROWTH_ASK_BUDGET_BASE ?? 30,
);
export const MONTHLY_GROWTH_ASK_BUDGET_LADDER = Math.min(
  4,
  Math.max(1, Number(process.env.MONTHLY_GROWTH_ASK_BUDGET_LADDER ?? 1)),
);

// Each fatigue signal (a refusal or an ignored ask) removes this many asks
// from the sender's monthly budget for the rest of the month. Env-adjustable
// for the same "config, not deploy" reason as the ladder itself.
export const FATIGUE_STEP_DOWN_PER_SIGNAL = Number(process.env.FATIGUE_STEP_DOWN_PER_SIGNAL ?? 5);

// An unanswered ask this old counts as "ignored" for fatigue purposes — much
// longer than taskAsks.service's 48h reminder window, since a reminder is
// routine and a fatigue signal should mean something really isn't landing.
const IGNORED_ASK_AFTER_HOURS = 168;

/**
 * Ticket 9 task 12, the founder's instruction of 1 September.
 *
 * Lika and Tornike agreed to meet and the system could not carry the last
 * step — the hour. She asked, he answered, she typed „12:00", and her
 * assistant said the truth: it could not send more in that conversation. The
 * per-task counter of ONE was doing that.
 *
 * The counter is gone; a budget replaces it, because "unlimited" is not the
 * answer either — a person's willingness to be asked is the rarest thing this
 * product has. This is the number we propose and it is easy to change: inside
 * ONE live goal, a sender may put at most this many messages on one person's
 * phone per rolling day. Four covers ask → answer → clarify → confirm, which
 * is what a meeting takes; it does not cover a conversation that has stopped
 * being one. The recipient can end it at any time (stop_contacting_me), the
 * goal closing ends it, and every single outbound message still needs their
 * sender's explicit approval of the exact text — that boundary does not move.
 */
export const RELAY_MESSAGES_PER_PERSON_PER_DAY = Number(
  process.env.RELAY_MESSAGES_PER_PERSON_PER_DAY ?? 4,
);

export type GrowthAskRefusalReason =
  | 'conversation_limit_reached'
  | 'monthly_budget_reached'
  | 'person_daily_relay_limit_reached';

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
       WHERE t.thread_id = $1 AND ta.from_user_id = $2::int AND ta.parent_ask_id IS NULL
         AND ta.is_follow_up = FALSE`,
      [threadId, fromUserId],
      BUDGET_QUERY_TIMEOUT_MS,
    );
    if (Number(inConversation.rows[0]?.count ?? 0) >= PER_CONVERSATION_GROWTH_ASK_LIMIT) {
      return { allowed: false, reason: 'conversation_limit_reached' };
    }
  }

  return checkMonthlyBudget(fromUserId);
}

/**
 * The budget for a message that CONTINUES a live relayed conversation: this
 * person already has this goal's question on their phone and has been talking
 * back. It is not outreach, so it does not spend the monthly growth budget or
 * the one-growth-ask-per-conversation floor — those exist to stop a user
 * spraying the network with cold questions, and a reply to a reply is the
 * opposite of that. What it does spend is the person's own patience, so it is
 * capped per person, per goal, per day (ticket 9 task 12).
 */
export async function checkFollowUpBudget(
  fromUserId: string,
  toUserId: number,
  taskId: number,
): Promise<AskBudgetOutcome> {
  const sentToday = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM task_asks
     WHERE from_user_id = $1::int AND to_user_id = $2 AND task_id = $3
       AND created_at > NOW() - INTERVAL '24 hours'`,
    [fromUserId, toUserId, taskId],
    BUDGET_QUERY_TIMEOUT_MS,
  );
  if (Number(sentToday.rows[0]?.count ?? 0) >= RELAY_MESSAGES_PER_PERSON_PER_DAY) {
    return { allowed: false, reason: 'person_daily_relay_limit_reached' };
  }
  return { allowed: true };
}

async function checkMonthlyBudget(fromUserId: string): Promise<AskBudgetOutcome> {
  const sentThisMonth = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM task_asks
     WHERE from_user_id = $1::int AND parent_ask_id IS NULL AND is_follow_up = FALSE
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
