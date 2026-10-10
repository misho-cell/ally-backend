import { query } from '../db/postgres/client';
import {
  accountDetailsFor,
  fetchAccountStates,
  NETAI_ACTIVE_SUBSCRIPTION_STATUSES,
} from './tools/membership';

/**
 * Task 1849 (§127): the people in the middle of a path to a named target, read
 * from the members' own phonebooks — every one of them a Netai member, because
 * the request travels assistant to assistant. The graph's shortest paths were
 * read first; when every one of them ran through somebody not on Netai, a
 * longer all-member path was never looked for. Searching members only finds it.
 *
 * Each person in the middle is named by the phone the person before them saved:
 * the owner's label for the first, and so on.
 */
const PEOPLE_READ = 300;
const PATHS_READ = 100;
const PATH_QUERY_TIMEOUT_MS = 8_000;

/**
 * The membership test of tools/membership.ts, in SQL, so a middle person who is
 * not on Netai is dropped BEFORE their phonebook is joined — without it the
 * three-step read walks every account's phonebook. membersOnly checks again.
 */
const IS_MEMBER_SQL = (userId: string, statusesParam: string): string => `(
  EXISTS (SELECT 1 FROM threads t WHERE t.user_id = ${userId})
  OR EXISTS (SELECT 1 FROM search_activity sa WHERE sa.user_id = ${userId}::text)
  OR EXISTS (SELECT 1 FROM "User" u WHERE u.id = ${userId}
              AND u.subscription_status = ANY(${statusesParam}::text[])))`;

interface SavedMember {
  readonly userId: number;
  readonly phone: string;
}

/** Of these accounts, the ones that are Netai members, by the phone they were saved under. */
async function membersOnly(people: readonly SavedMember[]): Promise<SavedMember[]> {
  if (people.length === 0) return [];
  const states = await fetchAccountStates(people.map((p) => p.phone));
  return people.filter((p) => accountDetailsFor(states, p.phone).state === 'netai_user');
}

/** The members in the owner's own phonebook. */
async function ownersMembers(ownerId: number): Promise<SavedMember[]> {
  const result = await query<{ phone: string; user_id: number }>(
    `SELECT DISTINCT ON (up."userId") ua.phone, up."userId" AS user_id
       FROM "UserAlias" ua JOIN "UserPhone" up ON up.phone = ua.phone
      WHERE ua."contactId" = $1::int AND up."userId" <> $1::int
      LIMIT $2`,
    [ownerId, PEOPLE_READ],
    PATH_QUERY_TIMEOUT_MS,
  );
  return membersOnly(result.rows.map((r) => ({ userId: Number(r.user_id), phone: r.phone })));
}

/** The members who have the target in their own phonebook, as user ids. */
async function membersHolding(targetPhone: string, ownerId: number): Promise<Set<number>> {
  const result = await query<{ phone: string; user_id: number }>(
    `SELECT DISTINCT ON (up."userId") up.phone, up."userId" AS user_id
       FROM "UserAlias" ua JOIN "UserPhone" up ON up."userId" = ua."contactId"
      WHERE ua.phone = $1 AND ua."contactId" <> $2::int
      LIMIT $3`,
    [targetPhone, ownerId, PEOPLE_READ],
    PATH_QUERY_TIMEOUT_MS,
  );
  const members = await membersOnly(
    result.rows.map((r) => ({ userId: Number(r.user_id), phone: r.phone })),
  );
  return new Set(members.map((m) => m.userId));
}

/** Two in the middle: a member of the owner's, who saved a member holding the target. */
async function twoStepMiddles(
  first: readonly SavedMember[],
  last: Set<number>,
): Promise<string[][]> {
  if (first.length === 0 || last.size === 0) return [];
  const result = await query<{ from_id: number; phone: string }>(
    `SELECT DISTINCT ua."contactId" AS from_id, ua.phone
       FROM "UserAlias" ua JOIN "UserPhone" up ON up.phone = ua.phone
      WHERE ua."contactId" = ANY($1::int[]) AND up."userId" = ANY($2::int[])
        AND up."userId" <> ua."contactId"
      LIMIT $3`,
    [first.map((m) => m.userId), [...last], PATHS_READ],
    PATH_QUERY_TIMEOUT_MS,
  );
  const phoneOf = new Map(first.map((m) => [m.userId, m.phone]));
  return result.rows.flatMap((r) => {
    const firstPhone = phoneOf.get(Number(r.from_id));
    return firstPhone === undefined ? [] : [[firstPhone, r.phone]];
  });
}

interface ThreeStepRow {
  readonly from_id: number;
  readonly mid_id: number;
  readonly mid_phone: string;
  readonly last_phone: string;
}

/** Three in the middle: owner's member → a member they saved → a member holding the target. */
async function threeStepMiddles(
  first: readonly SavedMember[],
  last: Set<number>,
  ownerId: number,
): Promise<string[][]> {
  if (first.length === 0 || last.size === 0) return [];
  const result = await query<ThreeStepRow>(
    `SELECT DISTINCT ua."contactId" AS from_id, up."userId" AS mid_id,
            ua.phone AS mid_phone, ub.phone AS last_phone
       FROM "UserAlias" ua
       JOIN "UserPhone" up ON up.phone = ua.phone
       JOIN "UserAlias" ub ON ub."contactId" = up."userId"
       JOIN "UserPhone" upb ON upb.phone = ub.phone
      WHERE ua."contactId" = ANY($1::int[]) AND upb."userId" = ANY($2::int[])
        AND up."userId" <> $3::int AND up."userId" <> ua."contactId" AND upb."userId" <> up."userId"
        AND ${IS_MEMBER_SQL('up."userId"', '$5')}
      LIMIT $4`,
    [
      first.map((m) => m.userId),
      [...last],
      ownerId,
      PATHS_READ,
      NETAI_ACTIVE_SUBSCRIPTION_STATUSES,
    ],
    PATH_QUERY_TIMEOUT_MS,
  );
  const middles = await membersOnly(
    result.rows.map((r) => ({ userId: Number(r.mid_id), phone: r.mid_phone })),
  );
  const memberMid = new Set(middles.map((m) => m.userId));
  const phoneOf = new Map(first.map((m) => [m.userId, m.phone]));
  return result.rows.flatMap((r) => {
    const firstPhone = phoneOf.get(Number(r.from_id));
    if (firstPhone === undefined || !memberMid.has(Number(r.mid_id))) return [];
    return [[firstPhone, r.mid_phone, r.last_phone]];
  });
}

/** Every all-member middle of up to three people, shortest first. */
export async function memberMiddles(ownerId: number, targetPhone: string): Promise<string[][]> {
  const [first, last] = await Promise.all([
    ownersMembers(ownerId),
    membersHolding(targetPhone, ownerId),
  ]);
  const oneStep = first.filter((m) => last.has(m.userId)).map((m) => [m.phone]);
  const [twoStep, threeStep] = await Promise.all([
    twoStepMiddles(first, last),
    threeStepMiddles(first, last, ownerId),
  ]);
  return [...oneStep, ...twoStep, ...threeStep];
}
