import { query } from '../db/postgres/client';
import { phoneDigits } from './phone';
import { Task } from './taskStore.service';

/**
 * The plan a goal runs inside (Ticket 10 Task 21; D118, D119).
 *
 * The founder's version, 7 September: the assistant proposes what counts as
 * solved, which routes it will pursue, whom it will involve and whom the user
 * does not want contacted; the user approves it once; inside it the assistant
 * acts on its own; a change to the plan needs a new yes, and the unchanged
 * parts keep running meanwhile.
 *
 * This module owns the record and the one question the ask path asks of it:
 * "does the plan in force allow a message to THIS person". It performs no
 * research and sends nothing.
 */

const PLAN_QUERY_TIMEOUT_MS = 8_000;
const MAX_TEXT_CHARS = 400;
const MAX_ROUTES = 8;
const MAX_PEOPLE = 40;
export const ROUTE_STATUSES = ['running', 'waiting', 'done', 'dropped'] as const;
export type RouteStatus = (typeof ROUTE_STATUSES)[number];

export interface PlanRoute {
  /** „ქსელში კითხვა", „ვებ-ძიება", „პირდაპირი მიმართვა" — a few words. */
  name: string;
  status: RouteStatus;
}

export interface PlanPerson {
  name: string;
  /** The phone id from a search result — the identity the ask path checks. */
  phone: string;
  /** Which route this person belongs to (a route name from `routes`). */
  route: string;
}

export interface PlanExclusion {
  name: string;
  /** Optional: known only when the person is in the phonebook. */
  phone?: string;
}

export interface TaskPlan {
  /** What the user will call "solved". */
  solved_when: string;
  routes: PlanRoute[];
  people_to_involve: PlanPerson[];
  never_contact: PlanExclusion[];
}

export interface StoredPlan extends TaskPlan {
  version: number;
  approved_at: string | null;
}

export type PlanOutcome<T> = { ok: true; value: T } | { ok: false; error: string };

function cleanText(raw: unknown, field: string): PlanOutcome<string> {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text === '') return { ok: false, error: `${field} is required` };
  return { ok: true, value: text.slice(0, MAX_TEXT_CHARS) };
}

/**
 * Read a plan out of whatever the model passed. Strict on the shape and
 * forgiving on nothing: a plan the ask path will enforce has to be exact.
 */
export function parsePlan(raw: unknown): PlanOutcome<TaskPlan> {
  if (raw === null || typeof raw !== 'object')
    return { ok: false, error: 'plan must be an object' };
  const input = raw as Record<string, unknown>;
  const solved = cleanText(input.solved_when, 'solved_when');
  if (!solved.ok) return solved;

  const routesRaw = Array.isArray(input.routes) ? input.routes : [];
  if (routesRaw.length === 0) return { ok: false, error: 'at least one route is required' };
  if (routesRaw.length > MAX_ROUTES) return { ok: false, error: `at most ${MAX_ROUTES} routes` };
  const routes: PlanRoute[] = [];
  for (const r of routesRaw) {
    const item = (r ?? {}) as Record<string, unknown>;
    const name = cleanText(item.name, 'route.name');
    if (!name.ok) return name;
    const status = typeof item.status === 'string' ? item.status : 'running';
    if (!(ROUTE_STATUSES as readonly string[]).includes(status)) {
      return { ok: false, error: `route status must be one of ${ROUTE_STATUSES.join(', ')}` };
    }
    routes.push({ name: name.value, status: status as RouteStatus });
  }
  const routeNames = new Set(routes.map((r) => r.name));

  const peopleRaw = Array.isArray(input.people_to_involve) ? input.people_to_involve : [];
  if (peopleRaw.length > MAX_PEOPLE) return { ok: false, error: `at most ${MAX_PEOPLE} people` };
  const people: PlanPerson[] = [];
  for (const p of peopleRaw) {
    const item = (p ?? {}) as Record<string, unknown>;
    const name = cleanText(item.name, 'person.name');
    if (!name.ok) return name;
    const phone = typeof item.phone === 'string' ? item.phone.trim() : '';
    if (phoneDigits(phone) === '') {
      return {
        ok: false,
        error: `person ${name.value}: phone id from a search result is required`,
      };
    }
    const route = typeof item.route === 'string' ? item.route.trim() : '';
    if (!routeNames.has(route)) {
      return { ok: false, error: `person ${name.value}: route must name one of the plan's routes` };
    }
    people.push({ name: name.value, phone, route });
  }

  const neverRaw = Array.isArray(input.never_contact) ? input.never_contact : [];
  const never: PlanExclusion[] = [];
  for (const n of neverRaw) {
    const item = (n ?? {}) as Record<string, unknown>;
    const name = cleanText(item.name, 'never_contact.name');
    if (!name.ok) return name;
    const phone =
      typeof item.phone === 'string' && item.phone.trim() ? item.phone.trim() : undefined;
    never.push(phone === undefined ? { name: name.value } : { name: name.value, phone });
  }

  return {
    ok: true,
    value: { solved_when: solved.value, routes, people_to_involve: people, never_contact: never },
  };
}

/**
 * Propose the next version. The plan in force, if any, keeps running.
 *
 * Every proposal is a new version (Ticket 11 Task 8): on 8 Sep the assistant's
 * proposal and the connector's changed plan both answered „version 1", so a
 * change could not be told from a repeat and D119's „a change needs a new yes"
 * could not be audited. The version now moves at the PROPOSAL; the yes binds
 * the version it was given.
 */
export async function proposeTaskPlan(
  userId: string,
  taskId: number,
  raw: unknown,
): Promise<PlanOutcome<{ version: number; summary: string }>> {
  const parsed = parsePlan(raw);
  if (!parsed.ok) return parsed;
  const result = await query<{ plan_version: number }>(
    `UPDATE tasks
     SET plan_proposed = $3::jsonb,
         plan_version = plan_version + 1,
         updated_at = NOW(),
         last_activity_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'open'
     RETURNING plan_version`,
    [taskId, userId, JSON.stringify(parsed.value)],
    PLAN_QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  if (!row) return { ok: false, error: 'No such open goal of yours.' };
  const version = Number(row.plan_version);
  return { ok: true, value: { version, summary: renderPlan(parsed.value, version, null) } };
}

/**
 * The user's yes. The proposed plan becomes the plan in force, and the
 * blanket ask permission is granted with it — approving a plan that names
 * people IS the consent to approach them (D119). This is ONE switch by
 * design (Ticket 11 Task 8, documented): the plan names whom the assistant
 * may write to, and the yes on the plan is the yes on those people; a person
 * the plan does not name is refused by the ask path whatever this flag says.
 */
export async function approveTaskPlan(
  userId: string,
  taskId: number,
): Promise<PlanOutcome<{ version: number; summary: string }>> {
  const result = await query<{ plan: TaskPlan; plan_version: number; plan_approved_at: string }>(
    `UPDATE tasks
     SET plan = plan_proposed,
         plan_proposed = NULL,
         plan_approved_at = NOW(),
         permission_granted = TRUE,
         updated_at = NOW(),
         last_activity_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'open' AND plan_proposed IS NOT NULL
     RETURNING plan, plan_version, plan_approved_at`,
    [taskId, userId],
    PLAN_QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  if (!row) return { ok: false, error: 'No proposed plan is waiting on this goal.' };
  return {
    ok: true,
    value: {
      version: row.plan_version,
      summary: renderPlan(row.plan, row.plan_version, row.plan_approved_at),
    },
  };
}

/** The plan in force on a task row, if any. */
export function planInForce(
  task: Pick<Task, 'plan' | 'plan_version' | 'plan_approved_at'>,
): StoredPlan | null {
  if (!task.plan) return null;
  return { ...task.plan, version: task.plan_version, approved_at: task.plan_approved_at };
}

export type PlanVerdict =
  | { allowed: true; reason: 'no_plan' | 'in_plan' }
  | { allowed: false; reason: 'never_contact' | 'outside_plan' };

/**
 * Does the plan in force allow a message to this person?
 *
 * No plan → the old rule decides (allowed here; the blanket permission gate
 * runs elsewhere). A person on never_contact → refused on every route. A
 * person the plan does not name → refused: that is a change to the plan and
 * needs a new yes, while everything the plan does name keeps running.
 */
export function planAllows(plan: StoredPlan | null, phone: string): PlanVerdict {
  if (plan === null) return { allowed: true, reason: 'no_plan' };
  const digits = phoneDigits(phone);
  if (plan.never_contact.some((n) => n.phone !== undefined && phoneDigits(n.phone) === digits)) {
    return { allowed: false, reason: 'never_contact' };
  }
  if (plan.people_to_involve.some((p) => phoneDigits(p.phone) === digits)) {
    return { allowed: true, reason: 'in_plan' };
  }
  return { allowed: false, reason: 'outside_plan' };
}

/**
 * A route's state in the words a person uses, not the words the code uses.
 *
 * Ticket 19 item 3: the plan a user reads carried „[waiting]" — an internal
 * value in brackets, in English, inside a Georgian sentence. This is the one
 * message whose whole job is to be understood well enough to approve, and it
 * was showing the reader a field name.
 */
const ROUTE_STATUS_WORDS: Readonly<Record<RouteStatus, string>> = {
  running: 'მიმდინარეობს',
  waiting: 'ველოდები',
  done: 'დასრულდა',
  dropped: 'შევწყვიტე',
};

/**
 * The plan as one message the user can read and approve.
 *
 * Every line here is read by somebody deciding whether to let us write to
 * their friends in their name. It carries no bracketed field values, no
 * parenthesised placeholders and no name printed twice — all three were in it
 * until ticket 19 item 3 said so, and a message that reads like a debug dump
 * is a message people approve without reading.
 */
export function renderPlan(plan: TaskPlan, version: number, approvedAt: string | null): string {
  const routes = plan.routes
    .map((r) => `- ${r.name} — ${ROUTE_STATUS_WORDS[r.status] ?? r.status}`)
    .join('\n');
  const people =
    plan.people_to_involve.length === 0
      ? 'ჯერ არავის'
      : plan.people_to_involve
          // The route is dropped when it only repeats the person — the live
          // plan showed „Dato Karada — Dato Karada", which tells the reader
          // nothing and looks like a fault in the product.
          .map((p) => (sameText(p.route, p.name) ? `- ${p.name}` : `- ${p.name} — ${p.route}`))
          .join('\n');
  const head = approvedAt
    ? `გეგმა v${version} (დამტკიცებულია)`
    : `გეგმა v${version} (დასამტკიცებელი)`;
  const lines = [
    head,
    `მოგვარებულია, როცა: ${plan.solved_when}`,
    `გზები:\n${routes}`,
    `ვის ვკითხავ:\n${people}`,
  ];
  // „Nobody" is not a list of nobody: an empty exclusion list means the
  // section has nothing to say, so it is left out rather than printed as an
  // empty bullet.
  if (plan.never_contact.length > 0) {
    lines.push(`ვის არასდროს:\n${plan.never_contact.map((n) => `- ${n.name}`).join('\n')}`);
  }
  return lines.join('\n');
}

/** Two pieces of text that name the same thing, ignoring case and spacing. */
function sameText(a: string, b: string): boolean {
  const fold = (t: string): string => t.trim().toLowerCase().replace(/\s+/g, ' ');
  return fold(a) === fold(b);
}
