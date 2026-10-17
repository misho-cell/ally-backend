import { query } from '../db/postgres/client';
import { askField } from './answerStats.service';
import { phoneDigits } from './phone';
import { Prematch, PrematchWord, prematchMany } from './prematch.service';
import { AnswerRates, answerRatesFor, CLASS_RANK } from './waveOrder';
import { ownerTiesTo, phoneForms, UNKNOWN_TIE } from './ownerTies';

/**
 * 1697 (A14, D679/D680): the warm path named its bridges and the order was
 * reach — so a request could start towards a bridge who would never take it.
 * Each bridge on the first step is now scored the way a wave is (A11's
 * pre-match from his own data, A8's answer rate in the goal's field), and a
 * rare shared contact is preferred over a famous one: fewer phonebooks that
 * hold him means a closer tie. Nothing of it is shown — only the order moves
 * (D680: no private fact to the other person, not even as the reason).
 */
const QUERY_TIMEOUT_MS = 5_000;
const NO_RECORD: AnswerRates = { field: 0.5, overall: 0.5 };

/**
 * The founder's question of 17 Oct (box 65045; Bible 2.4, Design Brief 3.1B):
 * shortest first, then WARMEST — and the order had no closeness in it at all.
 * The owner's closeness to the first bridge is the stored relationship score
 * (formal 0.4, close ≈0.67, family 0.9) plus the warmth the two built inside
 * Netai or the owner stated (save_close_contact). Compared in steps of a tenth,
 * so a near-stranger's 0.42 and 0.45 do not outrank a fit for the goal.
 */
const CLOSENESS_STEPS = 10;

export interface PathLike {
  readonly hops: number;
  readonly relayable: boolean;
  readonly bridges: ReadonlyArray<{ readonly phone: string }>;
}

export interface BridgeScores {
  readonly words: ReadonlyMap<string, Prematch>;
  readonly rates: ReadonlyMap<string, AnswerRates>;
  /** How many phonebooks hold each bridge, by digits. */
  readonly holders: ReadonlyMap<string, number>;
  /** The owner's closeness to each bridge, by digits; absent is a tie nobody described. */
  readonly closeness?: ReadonlyMap<string, number>;
}

/**
 * The paths in order: fewest hops, then the owner's closeness to the first
 * bridge, then A14's fit for the goal, then the original order.
 */
export function orderPaths<T extends PathLike>(paths: readonly T[], scores: BridgeScores): T[] {
  const keyOf = (path: T): readonly number[] => {
    const first = path.bridges[0];
    const d = first === undefined ? '' : phoneDigits(first.phone);
    const word = scores.words.get(d)?.word ?? PrematchWord.AskHim;
    const rates = scores.rates.get(d) ?? NO_RECORD;
    const closeness = scores.closeness?.get(d) ?? UNKNOWN_TIE;
    return [
      path.hops,
      -Math.round(closeness * CLOSENESS_STEPS),
      CLASS_RANK[word],
      -rates.field,
      scores.holders.get(d) ?? Number.MAX_SAFE_INTEGER,
      path.relayable ? 0 : 1,
    ];
  };
  return paths
    .map((path, index) => ({ path, index, key: keyOf(path) }))
    .sort((a, b) => {
      for (let i = 0; i < a.key.length; i += 1) {
        if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
      }
      return a.index - b.index;
    })
    .map(({ path }) => path);
}

/** How many phonebooks hold each number — the fewer, the rarer the shared contact. */
async function holderCounts(phones: readonly string[]): Promise<Map<string, number>> {
  const forms = phoneForms(phones);
  const out = new Map<string, number>();
  if (forms.length === 0) return out;
  const result = await query<{ phone: string; holders: number }>(
    `SELECT phone, COUNT(DISTINCT "contactId")::int AS holders
       FROM "UserAlias" WHERE phone = ANY($1::text[])
      GROUP BY phone
      LIMIT $2`,
    [forms, forms.length],
    QUERY_TIMEOUT_MS,
  );
  for (const row of result.rows) {
    const d = phoneDigits(row.phone);
    out.set(d, (out.get(d) ?? 0) + row.holders);
  }
  return out;
}

/** Every first bridge (and the receiver) scored for this goal, all at once. */
export async function scoreBridges(
  phones: readonly string[],
  goalText: string,
): Promise<BridgeScores> {
  const [words, rates, holders] = await Promise.all([
    prematchMany(phones, goalText),
    answerRatesFor(phones, askField(goalText)),
    holderCounts(phones),
  ]);
  return { words, rates, holders };
}

/** The owner's closeness to each bridge: the stored tie plus the warmth since, by digits. */
export async function closenessTo(
  userId: string,
  phones: readonly string[],
): Promise<Map<string, number>> {
  const ties = await ownerTiesTo(userId, phones);
  return new Map([...ties].map(([d, tie]) => [d, tie.closeness]));
}

const NO_GOAL_SCORES: BridgeScores = { words: new Map(), rates: new Map(), holders: new Map() };

/**
 * The paths in order; as they came when anything cannot be read. With no goal
 * there is nothing to fit, so only hops and closeness move them.
 */
export async function inBridgeOrder<T extends PathLike>(
  paths: readonly T[],
  goalText: string | null,
  userId: string,
): Promise<T[]> {
  if (paths.length < 2) return [...paths];
  try {
    const firsts = paths
      .map((p) => p.bridges[0]?.phone)
      .filter((p): p is string => p !== undefined);
    const hasGoal = goalText !== null && goalText.trim() !== '';
    const [fit, closeness] = await Promise.all([
      hasGoal ? scoreBridges(firsts, goalText) : Promise.resolve(NO_GOAL_SCORES),
      closenessTo(userId, firsts),
    ]);
    return orderPaths(paths, { ...fit, closeness });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[bridge-order] kept by reach:', (err as Error).message);
    return [...paths];
  }
}

interface IntroSides {
  readonly bridge_phone: string | null;
  readonly receiver_phone: string | null;
  readonly goal_text: string | null;
}

/**
 * 1697: the bridge's and the receiver's pre-match, written on the request in
 * one go, from the goal it was raised for. Best-effort and after the send: the
 * request never waits on it, and a failure is a missing admin column, logged.
 */
export async function recordIntroPrematch(requestId: number): Promise<void> {
  try {
    const sides = await query<IntroSides>(
      `SELECT (SELECT up.phone FROM "UserPhone" up WHERE up."userId" = ir.mediator_user_id LIMIT 1)
                AS bridge_phone,
              COALESCE(ir.target_phone,
                (SELECT up.phone FROM "UserPhone" up WHERE up."userId" = ir.target_user_id LIMIT 1))
                AS receiver_phone,
              (SELECT t.title FROM tasks t WHERE t.id = ir.requester_task_id) AS goal_text
         FROM introduction_requests ir WHERE ir.id = $1`,
      [requestId],
      QUERY_TIMEOUT_MS,
    );
    const row = sides.rows[0];
    if (row === undefined || row.goal_text === null) return;
    const phones = [row.bridge_phone, row.receiver_phone].filter((p): p is string => p !== null);
    const words = await prematchMany(phones, row.goal_text);
    const wordOf = (phone: string | null): string | null =>
      phone === null ? null : (words.get(phoneDigits(phone))?.word ?? null);
    await query(
      `UPDATE introduction_requests
          SET bridge_prematch = $2, receiver_prematch = $3, prematch_at = NOW()
        WHERE id = $1`,
      [requestId, wordOf(row.bridge_phone), wordOf(row.receiver_phone)],
      QUERY_TIMEOUT_MS,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[intro-prematch] request ${requestId}: not written:`, (err as Error).message);
  }
}
