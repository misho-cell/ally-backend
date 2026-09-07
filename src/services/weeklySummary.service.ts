import { query } from '../db/postgres/client';
import { queueFollowUp } from './pendingUpdates.service';
import { saveThreadMessage } from './threads.service';
import { planInForce, TaskPlan } from './taskPlans.service';

/**
 * Line 5 of the standard (D55, widened D127; Ticket 10 Task 24 (c)): a weekly
 * summary to the user, WHATEVER the news — active goals, work done, next steps,
 * costs, and the answers given automatically.
 *
 * Deterministic on purpose. The nightly wake is a model run and may say
 * anything; this is a ledger read, so what it says is what happened. It is
 * written into every open goal's own thread, so the goal is never silent for a
 * week, and queued once as a typed pending item, so the connector's
 * get_pending_updates carries it too (the tester's finding of 5 and 7 Sep:
 * nothing reached the connector unless a goal had a question).
 */

const SUMMARY_QUERY_TIMEOUT_MS = 15_000;
const WEEK_DAYS = 7;
const MAX_USERS_PER_RUN = 200;
export const WEEKLY_SUMMARY_KIND = 'weekly_summary';

interface GoalRow {
  id: number;
  title: string;
  thread_id: number | null;
  brief: string | null;
  next_wake_at: string | null;
  pending_question: string | null;
  plan: TaskPlan | null;
  plan_version: number;
  plan_approved_at: string | null;
  asks_sent: string;
  asks_answered: string;
  wakes: string;
}

export interface GoalSummary {
  task_id: number;
  title: string;
  thread_id: number | null;
  asks_sent: number;
  asks_answered: number;
  wakes: number;
  next_wake_at: string | null;
  pending_question: string | null;
  routes: { name: string; status: string }[];
}

export interface WeeklySummary {
  user_id: string;
  week_start: string;
  goals: GoalSummary[];
  tokens_spent: number;
  automatic_answers: number;
  text: string;
}

async function goalsForUser(userId: string): Promise<GoalRow[]> {
  const result = await query<GoalRow>(
    `SELECT t.id, t.title, t.thread_id, t.brief, t.next_wake_at, t.pending_question,
            t.plan, t.plan_version, t.plan_approved_at,
            (SELECT COUNT(*) FROM task_asks a
              WHERE a.task_id = t.id AND a.created_at >= NOW() - ($2 || ' days')::interval) AS asks_sent,
            (SELECT COUNT(*) FROM task_asks a
              WHERE a.task_id = t.id AND a.status = 'answered'
                AND a.answered_at >= NOW() - ($2 || ' days')::interval) AS asks_answered,
            (SELECT COUNT(*) FROM conversations c
              WHERE c.thread_id = t.thread_id AND c.role = 'user'
                AND c.content LIKE '[მოვლენა]%'
                AND c.created_at >= NOW() - ($2 || ' days')::interval) AS wakes
     FROM tasks t
     WHERE t.user_id = $1 AND t.status = 'open'
     ORDER BY t.last_activity_at DESC`,
    [userId, WEEK_DAYS],
    SUMMARY_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** Answers given for the user by their own standing rules this week (Task 22). */
async function automaticAnswers(userId: string): Promise<number> {
  const result = await query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM task_asks
     WHERE to_user_id = $1::int AND automatic
       AND answered_at >= NOW() - ($2 || ' days')::interval`,
    [userId, WEEK_DAYS],
    SUMMARY_QUERY_TIMEOUT_MS,
  );
  return Number(result.rows[0]?.n ?? 0);
}

async function tokensSpent(userId: string): Promise<number> {
  const result = await query<{ spent: string | null }>(
    `SELECT COALESCE(-SUM(amount), 0) AS spent FROM token_transactions
     WHERE user_id = $1 AND reason = 'chat_debit'
       AND created_at >= NOW() - ($2 || ' days')::interval`,
    [userId, WEEK_DAYS],
    SUMMARY_QUERY_TIMEOUT_MS,
  );
  return Math.max(0, Number(result.rows[0]?.spent ?? 0));
}

function dateOnly(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

/** The summary as one message. Pure: everything it says was passed in. */
export function renderWeeklySummary(
  goals: GoalSummary[],
  tokensSpentThisWeek: number,
  automaticAnswers: number,
  weekStart: string,
): string {
  const lines: string[] = [`კვირის შეჯამება (${weekStart}-დან)`, ''];
  if (goals.length === 0) {
    lines.push('აქტიური მიზანი არ არის.');
  } else {
    lines.push(`აქტიური მიზნები: ${goals.length}`);
    for (const g of goals) {
      lines.push('', `• ${g.title}`);
      lines.push(
        `  გაკეთდა: ${g.asks_sent} კითხვა გაიგზავნა, ${g.asks_answered} პასუხი მოვიდა, ` +
          `${g.wakes} ავტომატური ნაბიჯი.`,
      );
      if (g.routes.length > 0) {
        lines.push(`  გზები: ${g.routes.map((r) => `${r.name} [${r.status}]`).join(' · ')}`);
      }
      lines.push(
        g.pending_question
          ? `  გელოდება შენს პასუხს: „${g.pending_question}"`
          : `  შემდეგი ნაბიჯი: ${g.next_wake_at ? `${dateOnly(g.next_wake_at)}-ს ვუბრუნდები` : 'შემდეგ გაღვიძებაზე'}.`,
      );
    }
  }
  lines.push('', `ხარჯი ამ კვირაში: ${tokensSpentThisWeek} ტოკენი.`);
  lines.push(
    automaticAnswers > 0
      ? `შენი წესებით ავტომატურად გაცემული პასუხები: ${automaticAnswers}.`
      : 'შენი წესებით ავტომატურად გაცემული პასუხები: 0.',
  );
  return lines.join('\n');
}

/** The week's summary for one user, composed but not sent. */
export async function composeWeeklySummary(userId: string): Promise<WeeklySummary> {
  const [rows, spent, automatic] = await Promise.all([
    goalsForUser(userId),
    tokensSpent(userId),
    automaticAnswers(userId),
  ]);
  const goals: GoalSummary[] = rows.map((r) => {
    const plan = planInForce(r);
    return {
      task_id: r.id,
      title: r.title,
      thread_id: r.thread_id,
      asks_sent: Number(r.asks_sent),
      asks_answered: Number(r.asks_answered),
      wakes: Number(r.wakes),
      next_wake_at: r.next_wake_at,
      pending_question: r.pending_question,
      routes: plan ? plan.routes.map((x) => ({ name: x.name, status: x.status })) : [],
    };
  });
  const weekStart = new Date(Date.now() - WEEK_DAYS * 86_400_000).toISOString().slice(0, 10);
  return {
    user_id: userId,
    week_start: weekStart,
    goals,
    tokens_spent: spent,
    automatic_answers: automatic,
    text: renderWeeklySummary(goals, spent, automatic, weekStart),
  };
}

/** Was a summary already queued for this user in the last six days? */
async function summarisedRecently(userId: string): Promise<boolean> {
  const result = await query<{ id: number }>(
    `SELECT id FROM pending_updates
     WHERE user_id = $1 AND kind = $2 AND created_at >= NOW() - INTERVAL '6 days'
     LIMIT 1`,
    [userId, WEEKLY_SUMMARY_KIND],
    SUMMARY_QUERY_TIMEOUT_MS,
  );
  return result.rows.length > 0;
}

/**
 * Send one user's summary: into every open goal's thread, and once into the
 * pending list. Returns what was sent so an admin run can show it.
 */
export async function sendWeeklySummary(userId: string): Promise<WeeklySummary> {
  const summary = await composeWeeklySummary(userId);
  for (const goal of summary.goals) {
    if (goal.thread_id === null) continue;
    await saveThreadMessage(goal.thread_id, Number(userId), 'assistant', summary.text);
  }
  await queueFollowUp(
    userId,
    null,
    WEEKLY_SUMMARY_KIND,
    {
      text: summary.text,
      week_start: summary.week_start,
      goals: summary.goals.map((g) => ({
        task_id: g.task_id,
        title: g.title,
        asks_sent: g.asks_sent,
        asks_answered: g.asks_answered,
        pending_question: g.pending_question,
      })),
      tokens_spent: summary.tokens_spent,
      automatic_answers: summary.automatic_answers,
      instruction:
        'This is the weekly summary of the user’s goals. Give it to them in their language, ' +
        'in full, at the start of the conversation — whatever the news. Then ask nothing unless ' +
        'a goal is waiting on them.',
    },
    0,
  );
  return summary;
}

/** Every user with an open goal who has not had this week's summary yet. */
async function usersDueSummary(): Promise<string[]> {
  const result = await query<{ user_id: string }>(
    `SELECT DISTINCT t.user_id FROM tasks t
     WHERE t.status = 'open'
     ORDER BY t.user_id LIMIT $1`,
    [MAX_USERS_PER_RUN],
    SUMMARY_QUERY_TIMEOUT_MS,
  );
  const due: string[] = [];
  for (const row of result.rows) {
    if (!(await summarisedRecently(row.user_id))) due.push(row.user_id);
  }
  return due;
}

/** The weekly run. Returns how many users were written to. */
export async function sendWeeklySummaries(): Promise<number> {
  const users = await usersDueSummary();
  let sent = 0;
  for (const userId of users) {
    try {
      await sendWeeklySummary(userId);
      sent++;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[weekly-summary] user ${userId} failed:`, (err as Error).message);
    }
  }
  return sent;
}
