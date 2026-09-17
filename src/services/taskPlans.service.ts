import { query } from '../db/postgres/client';
import { phoneDigits } from './phone';
import { Task } from './taskStore.service';
import { canBeAsked, AskReach } from './taskAsks.service';
import { RunLanguage } from './runLanguage';

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
  /**
   * Ticket 20 row 146 — whether this person can actually be asked, decided
   * when the plan is PROPOSED rather than a minute after it is approved.
   * Absent on plans stored before the column existed, which renders as
   * nothing rather than as a claim either way.
   */
  reach?: AskReach;
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
  /**
   * Ticket 20 row 101a — matching a person to their route, forgivingly.
   *
   * Tornike's choice of 16 September, option (a), with (b) — routes by number
   * — to follow as the real fix.
   *
   * The rule required people_to_involve[].route to repeat one of the route
   * names EXACTLY, character for character. error_text caught what that cost
   * the moment it was added: four of four refused propose_task_plan calls that
   * afternoon said „person <name>: route must name one of the plan's routes",
   * and the model's retry each time was to SHORTEN its own route names until
   * they matched. Two whole extra runs per goal, for a copy of a
   * sixty-character Georgian string.
   *
   * The tie itself stays — a person must belong to a real route, because the
   * ask path enforces it. Only the comparison relaxes: case and surrounding or
   * repeated whitespace stop counting, and a plan with exactly ONE route needs
   * no naming at all, because there is nothing to be ambiguous between.
   */
  const routeKey = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();
  const routesByKey = new Map(routes.map((r) => [routeKey(r.name), r.name]));
  const onlyRoute = routes.length === 1 ? routes[0].name : null;

  function resolveRoute(said: string): string | null {
    const matched = routesByKey.get(routeKey(said));
    if (matched !== undefined) return matched;
    // A single-route plan: whatever they called it, there is only one road.
    return onlyRoute;
  }

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
    const said = typeof item.route === 'string' ? item.route : '';
    const route = resolveRoute(said);
    if (route === null) {
      return {
        ok: false,
        // The names are IN the error now. The model was rewriting its plan to
        // guess at them, which is what made one refusal cost a whole run.
        error:
          `person ${name.value}: route must name one of the plan's routes — ` +
          routes.map((r) => `"${r.name}"`).join(', '),
      };
    }
    // Stored as the route's OWN spelling, never the person's, so the plan
    // stays internally consistent whatever case the model used.
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
  /** The conversation's language — the card is read by the owner, not by us. */
  language: RunLanguage = 'ka',
): Promise<PlanOutcome<{ version: number; summary: string; everApproved: boolean }>> {
  const parsed = parsePlan(raw);
  if (!parsed.ok) return parsed;
  // Ticket 20 row 146: decided HERE, while the plan is being written, so the
  // owner reads it before saying yes. Concurrent, and a lookup that fails
  // leaves `reach` undefined — which renders as nothing, never as a claim that
  // somebody is unreachable.
  const withReach = await withReachability(parsed.value.people_to_involve);
  const plan: TaskPlan = { ...parsed.value, people_to_involve: withReach };
  // Row 140 returns plan_approved_at as well: whether this GOAL has ever had
  // an approved plan decides whether a route may claim to be under way. The
  // UPDATE does not touch that column, so what comes back is the previous
  // approval — exactly the question being asked.
  const result = await query<{ plan_version: number; plan_approved_at: Date | null }>(
    `UPDATE tasks
     SET plan_proposed = $3::jsonb,
         plan_version = plan_version + 1,
         updated_at = NOW(),
         last_activity_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'open'
     RETURNING plan_version, plan_approved_at`,
    [taskId, userId, JSON.stringify(plan)],
    PLAN_QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  if (!row) return { ok: false, error: 'No such open goal of yours.' };
  const version = Number(row.plan_version);
  const everApproved = row.plan_approved_at !== null;
  return {
    ok: true,
    value: {
      version,
      summary: renderPlan(plan, version, null, everApproved, language),
      everApproved,
    },
  };
}

/**
 * Ticket 20 row 146 — each named person's reachability, looked up together.
 *
 * Never throws: a plan must still be proposable when this lookup fails, and an
 * unknown reach is left UNDEFINED rather than guessed. Undefined renders as
 * nothing, so a failure costs a warning the owner did not get — it never
 * invents one about a person.
 */
async function withReachability(people: readonly PlanPerson[]): Promise<PlanPerson[]> {
  return Promise.all(
    people.map(async (person) => {
      try {
        const reach: AskReach = await canBeAsked(person.phone);
        return { ...person, reach };
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[plan-reach] ${person.name}: ${(err as Error).message}`);
        return person;
      }
    }),
  );
}

/**
 * The user's yes. The proposed plan becomes the plan in force, and the
 * blanket ask permission is granted with it — approving a plan that names
 * people IS the consent to approach them (D119). This is ONE switch by
 * design (Ticket 11 Task 8, documented): the plan names whom the assistant
 * may write to, and the yes on the plan is the yes on those people; a person
 * the plan does not name is refused by the ask path whatever this flag says.
 */
export type ApprovalRoute = 'chat' | 'admin';

export async function approveTaskPlan(
  userId: string,
  taskId: number,
  // Ticket 19 item 0: the timeline used to say only WHEN. Defaulted to the
  // owner's own session because that is where every existing caller approves
  // from; the admin panel names itself.
  via: ApprovalRoute = 'chat',
  language: RunLanguage = 'ka',
): Promise<PlanOutcome<{ version: number; summary: string }>> {
  const result = await query<{ plan: TaskPlan; plan_version: number; plan_approved_at: string }>(
    `UPDATE tasks
     SET plan = plan_proposed,
         plan_proposed = NULL,
         plan_approved_at = NOW(),
         plan_approved_by = $3::text,
         plan_approved_via = $4::text,
         permission_granted = TRUE,
         updated_at = NOW(),
         last_activity_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'open' AND plan_proposed IS NOT NULL
     RETURNING plan, plan_version, plan_approved_at`,
    [taskId, userId, userId, via],
    PLAN_QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  if (!row) return { ok: false, error: 'No proposed plan is waiting on this goal.' };
  return {
    ok: true,
    value: {
      version: row.plan_version,
      summary: renderPlan(row.plan, row.plan_version, row.plan_approved_at, undefined, language),
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
const ROUTE_STATUS_WORDS: Readonly<Record<RunLanguage, Record<RouteStatus, string>>> = {
  ka: { running: 'მიმდინარეობს', waiting: 'ველოდები', done: 'დასრულდა', dropped: 'შევწყვიტე' },
  en: { running: 'in progress', waiting: 'waiting', done: 'done', dropped: 'dropped' },
  ru: { running: 'в работе', waiting: 'жду', done: 'готово', dropped: 'прекратил' },
  es: { running: 'en curso', waiting: 'esperando', done: 'hecho', dropped: 'abandonado' },
};

/**
 * Ticket 20 row 140 — „in progress" on a route nothing has started.
 *
 * Goal 3703's plan read „ვები, რუსთავის ელექტრიკოსები, მიმდინარეობს" with no
 * web_search anywhere in the run. Goal 3928's plan v1 marked all three routes
 * in progress while nothing had been approved and nobody had been written to.
 * That is invented progress, and on an UNAPPROVED plan it is invented by
 * construction: the product's own rule is that nothing starts until the owner
 * says yes, so there is no state of the world in which those words are true.
 *
 * So the status is not trusted, it is DERIVED. Until this goal has had an
 * approved plan, every route reads „not started yet" whatever the model wrote.
 * Nothing is rewritten in storage — the model's intent stays recorded, and it
 * becomes visible the moment there is something it could honestly describe.
 *
 * The exception is why this takes a flag rather than reading approvedAt. A v2
 * proposed after v1 was approved is itself unapproved, but work on that goal
 * HAS begun, and showing „not started" there would be the same fault pointing
 * the other way — a false claim about the world, just a modest one.
 */
/** „Plan", the first word of the card. */
const PLAN_TITLE: Record<RunLanguage, string> = {
  ka: 'გეგმა',
  en: 'Plan',
  ru: 'План',
  es: 'Plan',
};

const ROUTE_NOT_STARTED: Record<RunLanguage, string> = {
  ka: 'ჯერ არ დაწყებულა',
  en: 'not started yet',
  ru: 'ещё не начато',
  es: 'aún no empezado',
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
/**
 * Ticket 20 row 146. Why a named person cannot be written to, in the owner's
 * words rather than the server's — and never as that person's own choice: the
 * opt-out list is deliberately not consulted at plan time, because a refusal
 * to be contacted is private to the person who made it.
 */
const REACH_NOTE: Record<RunLanguage, Record<Exclude<AskReach, 'ok'>, string>> = {
  ka: {
    not_member: '(Netai-ზე არ არის — მოწვევა დასჭირდება)',
    never_opened: '(ანგარიში აქვს, Netai ჯერ არ გაუხსნია — კითხვა უპასუხოდ დარჩებოდა)',
  },
  en: {
    not_member: '(not on Netai — will need an invitation)',
    never_opened: '(has an account but has never opened Netai — a question would go unanswered)',
  },
  ru: {
    not_member: '(нет в Netai — понадобится приглашение)',
    never_opened: '(аккаунт есть, но Netai ни разу не открывал — вопрос остался бы без ответа)',
  },
  es: {
    not_member: '(no está en Netai — hará falta una invitación)',
    never_opened: '(tiene cuenta pero nunca abrió Netai — la pregunta quedaría sin respuesta)',
  },
};

/** Said once, above the list, when the plan can reach NOBODY it names. */
const NOBODY_REACHABLE: Record<RunLanguage, string> = {
  ka:
    'ყურადღება: ამ გეგმაში დასახელებულ არცერთ ადამიანს ვერ მივწერ. დამტკიცება ' +
    'თავისთავად ვერაფერს გააგზავნის — ჯერ მოწვევა ან შენით მიწერა დასჭირდება.',
  en:
    'Note: I cannot write to a single person this plan names. Approving it sends ' +
    'nothing on its own — an invitation, or a message from you, has to come first.',
  ru:
    'Важно: ни одному из названных в плане людей я написать не могу. Подтверждение ' +
    'само по себе ничего не отправит — сначала нужно приглашение или твоё сообщение.',
  es:
    'Aviso: no puedo escribir a ninguna de las personas que nombra este plan. ' +
    'Aprobarlo no envía nada por sí solo — antes hace falta una invitación o un ' +
    'mensaje tuyo.',
};

/**
 * Ticket 20 row 203 — can this plan reach anybody at all?
 *
 * True only when the plan names people and NOT ONE of them can be written to.
 * An empty plan is false: „write to nobody" is a plan that works exactly as
 * intended, and the owner who asked for it must not be shown an invitation
 * card about people they told us to leave alone.
 *
 * A person whose reach could not be looked up counts as reachable. The lookup
 * failing is not evidence that a door is shut, and the whole point of this
 * predicate is to remove the approve button — an unknown must not do that.
 */
export function nobodyCanBeWrittenTo(plan: TaskPlan): boolean {
  const named = plan.people_to_involve;
  return named.length > 0 && named.every((p) => p.reach !== undefined && p.reach !== 'ok');
}

/** The people in this plan who are not on Netai — the ones an invite is for. */
export function peopleToInvite(plan: TaskPlan): string[] {
  return plan.people_to_involve.filter((p) => p.reach === 'not_member').map((p) => p.name);
}

/**
 * Ticket 20 row 203, second pass — the people to WAKE, which is not the same
 * list as the people to invite.
 *
 * I left these out, and the seat was right to catch it. Somebody who HAS an
 * account and has never opened Netai cannot be invited again — so I concluded
 * there was nothing to offer about them. D61 says the opposite, and it is the
 * whole growth story: waking a dormant old-Ally account is how this network
 * fills. „No invitation applies" and „nothing applies" are different facts,
 * and I substituted the second for the first.
 */
export function peopleToWake(plan: TaskPlan): string[] {
  return plan.people_to_involve.filter((p) => p.reach === 'never_opened').map((p) => p.name);
}

/**
 * The card's own headings, in the language the conversation is held in — the
 * seat's #4061 (h), and the last thing the server writes that was Georgian
 * whatever the owner typed.
 */
const PLAN_WORDS: Record<RunLanguage, Record<string, string>> = {
  ka: {
    approved: 'დამტკიცებულია',
    toApprove: 'დასამტკიცებელი',
    solvedWhen: 'მოგვარებულია, როცა',
    routes: 'გზები',
    whoIAsk: 'ვის ვკითხავ',
    nobodyYet: 'ჯერ არავის',
    neverAsk: 'ვის არასდროს',
  },
  en: {
    approved: 'approved',
    toApprove: 'awaiting your approval',
    solvedWhen: 'Solved when',
    routes: 'Routes',
    whoIAsk: 'Who I will ask',
    nobodyYet: 'nobody yet',
    neverAsk: 'Never ask',
  },
  ru: {
    approved: 'подтверждён',
    toApprove: 'ждёт подтверждения',
    solvedWhen: 'Решено, когда',
    routes: 'Пути',
    whoIAsk: 'Кого спрошу',
    nobodyYet: 'пока никого',
    neverAsk: 'Кого никогда',
  },
  es: {
    approved: 'aprobado',
    toApprove: 'pendiente de tu aprobación',
    solvedWhen: 'Resuelto cuando',
    routes: 'Vías',
    whoIAsk: 'A quién preguntaré',
    nobodyYet: 'a nadie todavía',
    neverAsk: 'A quién nunca',
  },
};

export function renderPlan(
  plan: TaskPlan,
  version: number,
  approvedAt: string | null,
  // Row 140: has this GOAL ever had an approved plan? Defaults from this
  // version's own approval, so every existing caller keeps its behaviour and
  // only the proposal path — the one that showed „in progress" before anything
  // could have started — has to say more.
  everApproved: boolean = approvedAt !== null,
  language: RunLanguage = 'ka',
): string {
  const words = PLAN_WORDS[language];
  const routes = plan.routes
    .map(
      (r) =>
        `- ${r.name} — ${everApproved ? (ROUTE_STATUS_WORDS[language][r.status] ?? r.status) : ROUTE_NOT_STARTED[language]}`,
    )
    .join('\n');
  const people =
    plan.people_to_involve.length === 0
      ? words.nobodyYet
      : plan.people_to_involve
          // The route is dropped when it only repeats the person — the live
          // plan showed „Dato Karada — Dato Karada", which tells the reader
          // nothing and looks like a fault in the product.
          .map((p) => {
            const base = sameText(p.route, p.name) ? `- ${p.name}` : `- ${p.name} — ${p.route}`;
            // Row 146: said BEFORE the yes. Tornike approved a plan naming
            // three people and learned 47 seconds later that not one of them
            // could be written to.
            return p.reach === undefined || p.reach === 'ok'
              ? base
              : `${base} ${REACH_NOTE[language][p.reach]}`;
          })
          .join('\n');
  const head = approvedAt
    ? `${PLAN_TITLE[language]} v${version} (${words.approved})`
    : `${PLAN_TITLE[language]} v${version} (${words.toApprove})`;
  const lines = [
    head,
    `${words.solvedWhen}: ${plan.solved_when}`,
    `${words.routes}:\n${routes}`,
    `${words.whoIAsk}:\n${people}`,
  ];
  // Row 146: the loudest case gets its own line. A plan naming three people
  // none of whom can be written to is not a plan, and the owner has to know
  // that before the yes, not 47 seconds after it.
  if (nobodyCanBeWrittenTo(plan)) {
    lines.splice(1, 0, NOBODY_REACHABLE[language]);
  }
  // „Nobody" is not a list of nobody: an empty exclusion list means the
  // section has nothing to say, so it is left out rather than printed as an
  // empty bullet.
  if (plan.never_contact.length > 0) {
    lines.push(`${words.neverAsk}:\n${plan.never_contact.map((n) => `- ${n.name}`).join('\n')}`);
  }
  return lines.join('\n');
}

/** Two pieces of text that name the same thing, ignoring case and spacing. */
function sameText(a: string, b: string): boolean {
  const fold = (t: string): string => t.trim().toLowerCase().replace(/\s+/g, ' ');
  return fold(a) === fold(b);
}
