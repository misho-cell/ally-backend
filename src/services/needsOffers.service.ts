import { query } from '../db/postgres/client';
import { fieldFits, placeFits } from './fieldPlaces';
import { deliverDueCards } from './matchFlow.service';

/**
 * 1699 (A16, D679/D680): two members — one with a need, one who said he is
 * open to exactly that (A15) — never meet unless one of them asks, and senior
 * people do not ask. Each night the matcher pairs an open goal with an active
 * offer in the same field, between members who can reach each other (own
 * phonebook, or one contact between them). This part only PROPOSES: no card
 * goes out from here, and nobody is named to anybody.
 *
 * The sure-match rule is D498's: the goal itself names the offer's field — a
 * vague match is dropped rather than shown.
 */
const QUERY_TIMEOUT_MS = 10_000;
/** Goals and offers read per night; the matcher catches up over nights, never in one sweep. */
const GOALS_READ = 2_000;
const OFFERS_READ = 1_000;
/** New proposals a night, so a first night with many offers cannot flood the cards. */
const MAX_PROPOSALS_PER_NIGHT = 200;
const DECLINED_PAIR_QUIET_DAYS = 90;

export interface OpenGoal {
  readonly id: number;
  readonly user_id: number;
  readonly title: string;
}

export interface ActiveOffer {
  readonly id: number;
  readonly user_id: number;
  readonly text: string;
  readonly field: string | null;
}

/**
 * D498: the goal names the offer's field — directly or through its family —
 * and is where the offer is (part 3). No field on the offer, no sure match.
 */
export function isSureMatch(goal: OpenGoal, offer: ActiveOffer): boolean {
  if (goal.user_id === offer.user_id) return false;
  const field = offer.field?.trim() ?? '';
  if (field === '') return false;
  return fieldFits(goal.title, field) && placeFits(goal.title, field);
}

/** Every sure (goal, offer) pair, in goal order, at most `limit`. */
export function surePairs(
  goals: readonly OpenGoal[],
  offers: readonly ActiveOffer[],
  limit: number = MAX_PROPOSALS_PER_NIGHT,
): Array<{ readonly goal: OpenGoal; readonly offer: ActiveOffer }> {
  const pairs: Array<{ readonly goal: OpenGoal; readonly offer: ActiveOffer }> = [];
  for (const goal of goals) {
    for (const offer of offers) {
      if (pairs.length >= limit) return pairs;
      if (isSureMatch(goal, offer)) pairs.push({ goal, offer });
    }
  }
  return pairs;
}

/** Every member when null; otherwise only these (the on-demand run on test seats). */
type MemberScope = readonly number[] | null;

async function openGoals(scope: MemberScope): Promise<OpenGoal[]> {
  const result = await query<OpenGoal>(
    `SELECT id, user_id::int AS user_id, title FROM tasks
      WHERE status = 'open' AND title IS NOT NULL
        AND ($2::text[] IS NULL OR user_id = ANY($2::text[]))
      ORDER BY id DESC LIMIT $1`,
    [GOALS_READ, scope === null ? null : scope.map(String)],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

async function activeOffers(scope: MemberScope): Promise<ActiveOffer[]> {
  const result = await query<ActiveOffer>(
    `SELECT id, user_id, text, field FROM offers
      WHERE active AND ($2::int[] IS NULL OR user_id = ANY($2::int[]))
      ORDER BY id DESC LIMIT $1`,
    [OFFERS_READ, scope],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * Can the need's owner reach the offer's owner — in his own phonebook, or
 * through one of his contacts who is a member and holds him? A pair declined
 * in the last 90 days, or already matched on this goal, is not proposed.
 */
async function proposeIfReachable(goal: OpenGoal, offer: ActiveOffer): Promise<boolean> {
  const result = await query<{ id: number }>(
    `WITH offer_phones AS (
       SELECT phone FROM "UserPhone" WHERE "userId" = $3::int
     ), reach AS (
       SELECT 1 FROM "UserAlias" ua
        WHERE ua."contactId" = $2::int AND ua.phone IN (SELECT phone FROM offer_phones)
       UNION ALL
       -- From the offer's side: who holds him (indexed on phone), and is that holder in mine?
       SELECT 1 FROM "UserAlias" theirs
         JOIN "UserPhone" member ON member."userId" = theirs."contactId"
         JOIN "UserAlias" mine ON mine.phone = member.phone AND mine."contactId" = $2::int
        WHERE theirs.phone IN (SELECT phone FROM offer_phones)
       LIMIT 1
     )
     INSERT INTO matches (need_goal_id, need_user_id, offer_id, offer_user_id)
     SELECT $1, $2::int, $4, $3::int
      WHERE EXISTS (SELECT 1 FROM reach)
        AND NOT EXISTS (
          SELECT 1 FROM matches m
           WHERE m.need_user_id = $2::int AND m.offer_user_id = $3::int AND m.state = 'declined'
             AND m.created_at > NOW() - make_interval(days => $5))
     ON CONFLICT (need_goal_id, offer_id) DO NOTHING
     RETURNING id`,
    [goal.id, goal.user_id, offer.user_id, offer.id, DECLINED_PAIR_QUIET_DAYS],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.length > 0;
}

/** One night's proposals; the number written. A failed pair is logged and the rest go on. */
export async function proposeMatches(scope: MemberScope = null): Promise<number> {
  const offers = await activeOffers(scope);
  if (offers.length === 0) return 0;
  const pairs = surePairs(await openGoals(scope), offers);
  let proposed = 0;
  for (const { goal, offer } of pairs) {
    try {
      if (await proposeIfReachable(goal, offer)) proposed += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[matcher] goal ${goal.id} × offer ${offer.id}:`, (err as Error).message);
    }
  }
  return proposed;
}

export enum SeatMatchOutcome {
  BadInput = 'bad_input',
  NotATestSeat = 'not_a_test_seat',
  Ran = 'ran',
}

/** The on-demand run takes a pair of seats or a few more, never a sweep. */
export const MAX_SEATS_PER_RUN = 10;

async function allAreTestSeats(userIds: readonly number[]): Promise<boolean> {
  const result = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM test_seats WHERE user_id = ANY($1::int[])`,
    [userIds],
    QUERY_TIMEOUT_MS,
  );
  return (result.rows[0]?.n ?? 0) === userIds.length;
}

/**
 * 1699 (tester 50557): the night's matcher and the noon cards, run now on
 * fictional seats only — the same proposals and the same card 1 the two
 * scheduled runs make, so the tester reads the cards today, not tomorrow.
 * Every seat named must be a test seat; nobody else is read or written.
 */
export interface SeatMatchRun {
  readonly outcome: SeatMatchOutcome;
  readonly proposed: number;
  readonly cards: number;
}

export async function runMatcherForSeats(seatIds: readonly number[]): Promise<SeatMatchRun> {
  const unique = [...new Set(seatIds)];
  if (unique.length === 0 || unique.length > MAX_SEATS_PER_RUN) {
    return { outcome: SeatMatchOutcome.BadInput, proposed: 0, cards: 0 };
  }
  if (!(await allAreTestSeats(unique))) {
    return { outcome: SeatMatchOutcome.NotATestSeat, proposed: 0, cards: 0 };
  }
  const proposed = await proposeMatches(unique);
  return { outcome: SeatMatchOutcome.Ran, proposed, cards: await deliverDueCards(unique) };
}
