import { query } from '../db/postgres/client';
import { BudgetWindow, budgetWindow } from './budgetWindow';

const BUDGET_QUERY_TIMEOUT_MS = 5_000;

// Ticket 6, engine T10: growth-ask budgets & fatigue dials. A "growth ask" is
// a question sent to another member on the sender's behalf (createAsk) — the
// mechanism by which the network grows. The assistant must be physically
// unable to exceed the budget; enforcement lives here, at the same
// server-side choke point as createAsk's own permission gate, not in the
// prompt.

// The founder, 8 September (D134): there is NO separate limit on asks —
// tokens are the one limit („let them spend that — as many asks as they want").
// The per-conversation floor of one is therefore OFF by default; the variable
// keeps it switchable without a deploy (0 = off).
const PER_CONVERSATION_GROWTH_ASK_LIMIT = Number(
  process.env.PER_CONVERSATION_GROWTH_ASK_LIMIT ?? 0,
);

/**
 * The one brake that stays on the SENDING side (D134): a sender whose asks
 * keep being ignored or keep causing opt-outs is slowed to the floor for the
 * window — never stopped. Below this many fatigue signals the sender is not
 * capped at all.
 */
export const FATIGUE_BRAKE_SIGNALS = Number(process.env.FATIGUE_BRAKE_SIGNALS ?? 3);

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
 * How far back fatigue is remembered (ticket 9 task 17).
 *
 * It used to be remembered for ever. The founder's account was silenced on
 * 1 September — a new month, no asks sent — because four of his asks had gone
 * unanswered in August and two rows said he had once switched incoming asks
 * off: six signals × 5 = the whole budget of 30, leaving zero. Nothing in the
 * arithmetic could ever give it back: a lifetime counter only grows, and an
 * account with no asks left cannot earn a signal back by sending a good one.
 *
 * Fatigue is a fact about how the network is reacting NOW, so it is read from
 * a window and it decays out of it.
 */
export const FATIGUE_WINDOW_DAYS = Number(process.env.FATIGUE_WINDOW_DAYS ?? 60);

/**
 * The floor fatigue can never push a sender below (ticket 9 task 17). Fatigue
 * narrows the channel; it must not close it, or the only way back would be an
 * action the closed channel forbids.
 */
export const MIN_MONTHLY_ASK_BUDGET = Number(process.env.MIN_MONTHLY_ASK_BUDGET ?? 5);

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
  | 'fatigue_budget_exhausted'
  | 'person_daily_relay_limit_reached';

export interface AskBudgetOutcome {
  allowed: boolean;
  reason?: GrowthAskRefusalReason;
}

export interface FatigueSignals {
  /** Recipients who switched asks off within a week of hearing from this sender. */
  readonly opt_outs_caused: number;
  /** This sender's own asks that nobody answered inside the ignored window. */
  readonly asks_ignored: number;
  readonly total: number;
}

/**
 * Fatigue signals attributable to this sender, inside the window.
 *
 * The old query counted `ask_optout_events WHERE user_id = <sender>` — rows
 * that record the sender's OWN decision to stop RECEIVING questions. The
 * founder had switched his incoming asks off twice in August while testing
 * (and switched them back on), and the budget read those two rows as evidence
 * that he tires other people out. A user asking to be left alone is not a
 * fatigue signal about them; it is a fact about their own inbox.
 *
 * What counts now, and only inside FATIGUE_WINDOW_DAYS:
 *   - a RECIPIENT of one of this sender's asks switching asks off within a
 *     week of receiving it, and not having resumed since;
 *   - one of this sender's own asks left unanswered past the ignored window.
 */
async function countFatigueSignals(userId: string): Promise<FatigueSignals> {
  const result = await query<{ opt_outs: string; ignored: string }>(
    `SELECT
       (SELECT COUNT(DISTINCT e.user_id) FROM ask_optout_events e
         WHERE e.action = 'opt_out'
           AND e.created_at > NOW() - ($2 || ' days')::INTERVAL
           AND EXISTS (
             SELECT 1 FROM task_asks ta
             WHERE ta.to_user_id = e.user_id AND ta.from_user_id = $1::int
               AND ta.created_at <= e.created_at
               AND ta.created_at > e.created_at - INTERVAL '7 days'
           )
           AND NOT EXISTS (
             SELECT 1 FROM ask_optout_events r
             WHERE r.user_id = e.user_id AND r.action = 'resume'
               AND r.created_at > e.created_at
           )) AS opt_outs,
       (SELECT COUNT(*) FROM task_asks
          WHERE from_user_id = $1::int AND status = 'sent'
            AND created_at < NOW() - INTERVAL '${IGNORED_ASK_AFTER_HOURS} hours'
            AND created_at > NOW() - ($2 || ' days')::INTERVAL) AS ignored`,
    [userId, FATIGUE_WINDOW_DAYS],
    BUDGET_QUERY_TIMEOUT_MS,
  );
  const optOuts = Number(result.rows[0]?.opt_outs ?? 0);
  const ignored = Number(result.rows[0]?.ignored ?? 0);
  return { opt_outs_caused: optOuts, asks_ignored: ignored, total: optOuts + ignored };
}

/** A timestamp column, as ISO text, whatever shape the driver returned it in. */
function isoOrEmpty(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.length > 0) return new Date(value).toISOString();
  return '';
}

export interface AskBudgetState {
  readonly monthly_budget_base: number;
  readonly ladder: number;
  readonly fatigue_signals: FatigueSignals;
  readonly fatigue_window_days: number;
  readonly fatigue_step_down_per_signal: number;
  readonly min_monthly_budget: number;
  /**
   * D134 (8 Sep): the sending side is uncapped — tokens are the limit — unless
   * the fatigue brake is on, when the floor is the cap for the window.
   */
  readonly sending_cap: 'none' | 'fatigue_brake';
  readonly fatigue_brake_signals: number;
  /** Null when uncapped; the floor when the brake is on. */
  readonly effective_monthly_budget: number | null;
  readonly sent_this_month: number;
  /** Null when uncapped. */
  readonly remaining_this_month: number | null;
  /**
   * The budget's window: the calendar month by default, the calendar week
   * when BUDGET_WINDOW=week (D124). The fatigue window is rolling either way.
   */
  readonly window: BudgetWindow['label'];
  readonly window_resets_at: string;
  readonly relay_messages_per_person_per_day: number;
}

/**
 * The whole budget, in numbers a person can read (ticket 9 task 17): the
 * founder's account refused an ask on a month in which it had sent none, and
 * there was no route — admin, tool or otherwise — to see why. Behind
 * /admin/users/:id and get_netai_info("limits").
 */
export async function describeAskBudget(userId: string): Promise<AskBudgetState> {
  const window = budgetWindow();
  const sent = await query<{ count: string; resets_at: string | Date }>(
    `SELECT
       (SELECT COUNT(*) FROM task_asks
         WHERE from_user_id = $1::int AND parent_ask_id IS NULL AND is_follow_up = FALSE
           AND created_at > ${window.windowStartSql}) AS count,
       (${window.windowResetSql}) AS resets_at`,
    [userId],
    BUDGET_QUERY_TIMEOUT_MS,
  );
  const fatigue = await countFatigueSignals(userId);
  const braked = fatigue.total >= FATIGUE_BRAKE_SIGNALS;
  const effective = braked ? MIN_MONTHLY_ASK_BUDGET : null;
  const sentThisMonth = Number(sent.rows[0]?.count ?? 0);
  return {
    monthly_budget_base: MONTHLY_GROWTH_ASK_BUDGET_BASE,
    ladder: MONTHLY_GROWTH_ASK_BUDGET_LADDER,
    fatigue_signals: fatigue,
    fatigue_window_days: FATIGUE_WINDOW_DAYS,
    fatigue_step_down_per_signal: FATIGUE_STEP_DOWN_PER_SIGNAL,
    min_monthly_budget: MIN_MONTHLY_ASK_BUDGET,
    sending_cap: braked ? 'fatigue_brake' : 'none',
    fatigue_brake_signals: FATIGUE_BRAKE_SIGNALS,
    effective_monthly_budget: effective,
    sent_this_month: sentThisMonth,
    remaining_this_month: effective === null ? null : Math.max(0, effective - sentThisMonth),
    window: window.label,
    // node-postgres hands back a Date for a timestamp, and String() on one is
    // „Thu Oct 01 2026 00:00:00 GMT+0000 (Coordinated Universal Time)" — which
    // the wake note then truncated to „Thu Oct 0". ISO, like every other date
    // that leaves this server.
    window_resets_at: isoOrEmpty(sent.rows[0]?.resets_at),
    relay_messages_per_person_per_day: RELAY_MESSAGES_PER_PERSON_PER_DAY,
  };
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
  if (threadId !== undefined && PER_CONVERSATION_GROWTH_ASK_LIMIT > 0) {
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

/**
 * The sending side after D134 (8 Sep): no allowance is counted against — the
 * tokens are the limit. What remains is the brake: a sender with enough
 * fatigue signals in the window (asks ignored, opt-outs caused) is held to the
 * floor for the window, so a channel that keeps not working is narrowed, never
 * closed. `monthly_budget_reached` is no longer produced.
 */
async function checkMonthlyBudget(fromUserId: string): Promise<AskBudgetOutcome> {
  const fatigue = await countFatigueSignals(fromUserId);
  if (fatigue.total < FATIGUE_BRAKE_SIGNALS) return { allowed: true };
  // Counted in the window in force (D124) — the month unless BUDGET_WINDOW=week.
  const sentThisWindow = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM task_asks
     WHERE from_user_id = $1::int AND parent_ask_id IS NULL AND is_follow_up = FALSE
       AND created_at > ${budgetWindow().windowStartSql}`,
    [fromUserId],
    BUDGET_QUERY_TIMEOUT_MS,
  );
  const sent = Number(sentThisWindow.rows[0]?.count ?? 0);
  if (sent < MIN_MONTHLY_ASK_BUDGET) return { allowed: true };
  return { allowed: false, reason: 'fatigue_budget_exhausted' };
}
