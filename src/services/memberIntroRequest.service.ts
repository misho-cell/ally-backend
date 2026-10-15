import { query } from '../db/postgres/client';
import { chainMapsFor } from './chainMap.service';
import { ChainLink, ChainLinkRole, ChainMap } from './chainMap';
import { decodeContactRef } from './mcp/contactRef';
import { normalizePhone } from './phone';
import { requestIntroduction } from './tools/requestIntroduction';

/**
 * 4621 (the frontend's 21:10Z item 4, Misho's yes): the member card's
 * „გაცნობის თხოვნა". The owner taps it on a person reached through the path
 * map, and the introduction is asked of the first friend on the best path —
 * the same request the assistant makes with request_introduction, so the
 * bridge sees it, answers it and is let off it in exactly the same way.
 */
export enum MemberIntroRefusal {
  NoSuchPerson = 'no_such_person',
  NoBridgeOnNetai = 'no_bridge_on_netai',
  NoSuchGoal = 'no_such_goal',
  NotSent = 'not_sent',
}

export type MemberIntroOutcome =
  | { readonly ok: true; readonly requestId: number; readonly threadId: number | null }
  | { readonly ok: false; readonly refusal: MemberIntroRefusal };

const LOOKUP_TIMEOUT_MS = 3_000;

/** The owner's own contact who takes the first step, on the first path where they use Netai. */
export function firstAskableBridge(maps: readonly ChainMap[]): ChainLink | null {
  for (const map of maps) {
    const first = map.links.find((link) => link.role === ChainLinkRole.Bridge);
    if (first !== undefined && first.is_member && first.id !== null && first.name !== null) {
      return first;
    }
  }
  return null;
}

async function ownGoal(ownerId: number, goalId: number): Promise<boolean> {
  const found = await query<{ id: number }>(
    'SELECT id FROM tasks WHERE id = $1 AND user_id = $2 LIMIT 1',
    [goalId, ownerId],
    LOOKUP_TIMEOUT_MS,
  );
  return found.rows.length > 0;
}

/** The owner's side of the request: its own thread, or the conversation it was filed in. */
async function requesterThreadOf(ownerId: number, requestId: number): Promise<number | null> {
  const found = await query<{ id: number }>(
    `SELECT id FROM threads
      WHERE user_id = $1 AND introduction_request_id = $2 AND type = 'outgoing_request'
      ORDER BY id LIMIT 1`,
    [ownerId, requestId],
    LOOKUP_TIMEOUT_MS,
  );
  return found.rows[0]?.id ?? null;
}

interface IntroduceResult {
  readonly success?: unknown;
  readonly request_id?: unknown;
  readonly shown_in_thread?: unknown;
}

export async function requestIntroToMember(
  ownerId: number,
  ref: string,
  goalId?: number,
): Promise<MemberIntroOutcome> {
  const targetPhone = decodeContactRef(String(ownerId), ref);
  const maps = targetPhone === null ? null : await chainMapsFor(ownerId, ref);
  if (targetPhone === null || maps === null) {
    return { ok: false, refusal: MemberIntroRefusal.NoSuchPerson };
  }
  if (goalId !== undefined && !(await ownGoal(ownerId, goalId))) {
    return { ok: false, refusal: MemberIntroRefusal.NoSuchGoal };
  }
  const bridge = firstAskableBridge(maps);
  const bridgePhone = bridge?.id ? decodeContactRef(String(ownerId), bridge.id) : null;
  const target = maps[0]?.links.find((link) => link.role === ChainLinkRole.Target);
  if (bridge === null || bridge.name === null || bridgePhone === null) {
    return { ok: false, refusal: MemberIntroRefusal.NoBridgeOnNetai };
  }
  const result = (await requestIntroduction(
    String(ownerId),
    bridge.name,
    target?.name ?? '',
    undefined,
    normalizePhone(bridgePhone),
    undefined,
    normalizePhone(targetPhone),
    'intro',
    false,
    goalId !== undefined ? { requesterTaskId: goalId } : {},
  )) as IntroduceResult;
  if (result.success !== true || typeof result.request_id !== 'number') {
    return { ok: false, refusal: MemberIntroRefusal.NotSent };
  }
  const own = await requesterThreadOf(ownerId, result.request_id);
  const shown = typeof result.shown_in_thread === 'number' ? result.shown_in_thread : null;
  return { ok: true, requestId: result.request_id, threadId: own ?? shown };
}
