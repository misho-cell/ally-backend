import { query } from '../db/postgres/client';
import {
  AskRow,
  askRoute,
  introRoute,
  RouteRole,
  RouteRow,
  routesOfOwnGoal,
} from './routesBoard.service';
import { nameAsSavedBySql } from './savedNameSql';

/**
 * 4927 (Giorgi, 13 Oct): the design's path for a person in the MIDDLE of a
 * chain — the one who asked them → them → the people they passed it on to.
 * The owner of the conversation is the middle; the routes board (D722) covers
 * the other side, the goal's own owner.
 */
const QUERY_TIMEOUT_MS = 5_000;
const MAX_NEXT = 20;

export interface PreviousPerson {
  readonly name: string | null;
  readonly member_id: number;
}

export interface ChainPosition {
  readonly previous: PreviousPerson | null;
  readonly next: readonly RouteRow[];
}

export const NOT_IN_A_CHAIN: ChainPosition = { previous: null, next: [] };

interface AskedHere {
  readonly ask_id: number;
  readonly asker_id: number;
  readonly name: string | null;
}

/** The question this conversation was opened for, asked of its owner. */
async function askedHere(userId: number, threadId: number): Promise<AskedHere | null> {
  const result = await query<AskedHere>(
    `SELECT p.id AS ask_id, p.from_user_id AS asker_id,
            ${nameAsSavedBySql('p.to_user_id', 'p.from_user_id')} AS name
       FROM task_asks p
       JOIN threads th ON th.id = p.ask_thread_id
      WHERE p.ask_thread_id = $1 AND p.to_user_id = $2 AND th.user_id = $2
      ORDER BY p.id DESC LIMIT 1`,
    [threadId, userId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

/** The questions the owner passed on from that one, each with its state. */
async function passedOn(userId: number, askId: number): Promise<AskRow[]> {
  const result = await query<AskRow>(
    `SELECT c.id, ${nameAsSavedBySql('c.from_user_id', 'c.to_user_id')} AS name, c.status, c.answer,
            c.declined_at, c.seen_at, c.later_until, c.expired_at,
            GREATEST(c.created_at, c.answered_at, c.declined_at, c.seen_at, c.expired_at)
              AS updated_at
       FROM task_asks c
      WHERE c.parent_ask_id = $1 AND c.from_user_id = $2
      ORDER BY c.created_at ASC
      LIMIT $3`,
    [askId, userId, MAX_NEXT],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

interface IntroducedHere {
  readonly id: number;
  readonly requester_id: number;
  readonly requester_name: string | null;
  readonly name: string | null;
  readonly status: string;
  readonly target_name: string;
  readonly updated_at: string;
}

/** An introduction its owner was asked to make here: the asker → them → the person named. */
async function introducedHere(userId: number, threadId: number): Promise<IntroducedHere | null> {
  const result = await query<IntroducedHere>(
    `SELECT ir.id, ir.requester_user_id AS requester_id,
            ${nameAsSavedBySql('ir.mediator_user_id', 'ir.requester_user_id')} AS requester_name,
            NULL::text AS name, ir.status, ir.target_name,
            COALESCE(ir.responded_at, ir.created_at) AS updated_at
       FROM introduction_requests ir
       JOIN threads th ON th.id = $1 AND th.user_id = $2
      WHERE ir.mediator_user_id = $2
        AND (ir.id = th.introduction_request_id OR ir.mediator_thread_id = th.id)
      ORDER BY ir.id DESC LIMIT 1`,
    [threadId, userId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

/** Where the owner of this conversation stands in a chain; NOT_IN_A_CHAIN when nowhere. */
export async function chainPositionOf(userId: number, threadId: number): Promise<ChainPosition> {
  const asked = await askedHere(userId, threadId);
  if (asked !== null) {
    const now = new Date();
    const next = (await passedOn(userId, asked.ask_id)).map((row) => askRoute(row, now));
    return { previous: { name: asked.name, member_id: asked.asker_id }, next };
  }
  const intro = await introducedHere(userId, threadId);
  if (intro === null) return ownersPath(userId, threadId);
  const toTarget = {
    ...introRoute(intro),
    person_name: intro.target_name,
    role: RouteRole.Addressee,
    summary: null,
    target_name: null,
  };
  return {
    previous: { name: intro.requester_name, member_id: intro.requester_id },
    next: [toTarget],
  };
}

/**
 * 4927, Giorgi's retest (13 Oct): the path belongs on every case card, the
 * owner's own goals too, where it is you → the people the goal is talking to.
 * The same people as the routes board, but one is already a path.
 */
async function ownersPath(userId: number, threadId: number): Promise<ChainPosition> {
  const next = await routesOfOwnGoal(userId, threadId);
  return next.length === 0 ? NOT_IN_A_CHAIN : { previous: null, next };
}
