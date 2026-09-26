import { query } from '../db/postgres/client';
import { joinedNetai, usedNetai } from './netaiMembership';

/**
 * WHO INVITED WHOM — row 264, the founder: „the admin does not show who
 * invited whom. Done when: the admin shows the invitation/referral tree."
 *
 * The data was already there — `User."inviterReferralUserId"` — and nothing
 * ever read it as a shape. 806 accounts carry an inviter, across 77 inviters,
 * the oldest from November 2023.
 *
 * ⚠️ AND THAT NUMBER IS THE TRAP THIS FILE EXISTS TO AVOID. `ro.sh` refuses to
 * let a query say „users" without saying WHICH: the base holds 62,164 legacy
 * Ally accounts who have never opened Netai, 20 fictional test seats, and a few
 * dozen real people who have. A tree showing „806 invited" would be true and
 * would tell the founder something false — almost all of them are legacy rows
 * imported long before Netai existed.
 *
 * So every node says which population it belongs to, and the counts are broken
 * out the same way. „How many did I bring" and „how many of them actually
 * turned up" are different questions and this answers both.
 */

/** Which of the three populations a row belongs to — the distinction `ro.sh` insists on. */
export type Population = 'netai_user' | 'ally_account' | 'test_seat';

export interface ReferralNode {
  readonly user_id: number;
  /** A name, never a number: D149 keeps phones out of everything this returns. */
  readonly name: string | null;
  readonly joined: string | null;
  readonly population: Population;
  /** People this person invited, at every depth below — not just the ones shown. */
  readonly invited_total: number;
  /** Of those, the ones who have actually opened Netai. */
  /** Arrived. See `counted` — one number alone hides which half is failing. */
  readonly invited_who_joined_netai: number;
  readonly invited_who_opened_netai: number;
  readonly invited: ReferralNode[];
}

/**
 * Six, because the invitation reward goes six levels (row 263) and a tree that
 * stops shallower cannot be checked against it. Capped so a cycle in the data
 * — which nothing forbids — cannot walk for ever.
 */
export const MAX_DEPTH = 6;
/** Whatever the depth, the answer stays readable and the query stays bounded. */
export const MAX_NODES = 400;
const TREE_TIMEOUT_MS = 8_000;

interface Row {
  user_id: number;
  name: string | null;
  joined: string | null;
  inviter: number | null;
  is_seat: boolean;
  opened_netai: boolean;
  joined_netai: boolean;
}

/**
 * ⚠️ THIS USED TO SAY „opened Netai is having a thread", and the tester found
 * what that cost by comparing two screens: `/admin/users` called Sofo
 * (172497) a `netai_user` and this called her an `ally_account`, because she
 * had registered through the founder's invite that morning and had not yet
 * opened a conversation.
 *
 * The connector's instructions say an `ally_account` „has never opened Netai —
 * it is a target, not a member", so this was about to have the product pitch
 * Netai to somebody who had just joined it. Across the 805 invitees the two
 * rules gave 8 and 15.
 *
 * So both facts are read, under two names, from ONE shared definition that
 * every other reader uses too (`netaiMembership`). The part of the old
 * reasoning that was right is kept there: `hasAccessToAlly` still cannot tell
 * the populations apart, because `registerUser` writes it for everybody.
 */
const ROWS = `
  SELECT u.id                                   AS user_id,
         NULLIF(TRIM(u.name), '')               AS name,
         u."createdAt"                          AS joined,
         u."inviterReferralUserId"              AS inviter,
         EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = u.id)         AS is_seat,
         ${joinedNetai('u')}                                                  AS joined_netai,
         ${usedNetai('u')}                                                    AS opened_netai
    FROM "User" u
   WHERE u."deletedAt" IS NULL
     AND (u."inviterReferralUserId" IS NOT NULL
          OR u.id = ANY($1::int[])
          -- ⚠️ WITHOUT THIS LINE THE FOREST IS ALWAYS EMPTY, and the tester
          -- reported exactly that: no root named, counted says 805, roots
          -- says []. A top of the forest is BY DEFINITION somebody nobody
          -- invited, and the first clause selects only people who WERE
          -- invited — so the rows the walk needs as roots were the one group
          -- the read could not return. It looked like a walk that found
          -- nothing; it was a read that never fetched them.
          OR EXISTS (SELECT 1 FROM "User" inv
                      WHERE inv."inviterReferralUserId" = u.id
                        AND inv."deletedAt" IS NULL))`;

function populationOf(row: Row): Population {
  if (row.is_seat) return 'test_seat';
  // JOINED, not used: the opposite of this label is „never heard of us", and
  // that is who a pitch is for. Somebody who registered this morning is not.
  return row.joined_netai ? 'netai_user' : 'ally_account';
}

export interface ReferralTree {
  readonly roots: ReferralNode[];
  /** True when the walk stopped at MAX_NODES — said, never implied. */
  readonly truncated: boolean;
  readonly counted: {
    readonly invited_rows_in_all: number;
    /**
     * ⚠️ TWO NUMBERS, BECAUSE THE FUNNEL IS THE POINT. The tester: „the
     * founder still sees 8 of 805 and not the funnel." Joined is who arrived
     * (15); opened is who then wrote something (8). One number alone answers
     * neither „is the invite working" nor „is the product working", and which
     * of those is failing is the whole question.
     */
    readonly of_them_joined_netai: number;
    readonly of_them_opened_netai: number;
    readonly of_them_test_seats: number;
  };
}

/**
 * The tree under one person, or the whole forest when no root is named.
 *
 * One read of every invited row and then a walk in memory. The alternative —
 * a recursive CTE — would be one query and would also have to be trusted to
 * terminate on data that has no constraint against a cycle; this way the depth
 * and the node cap are in code where they can be read.
 */
export async function referralTree(rootUserId?: number, depth = 3): Promise<ReferralTree> {
  const wanted = Math.min(MAX_DEPTH, Math.max(1, Math.floor(depth || 3)));
  const result = await query<Row>(
    ROWS,
    [rootUserId === undefined ? [] : [rootUserId]],
    TREE_TIMEOUT_MS,
  );
  const rows = result.rows;

  const byId = new Map<number, Row>(rows.map((r) => [Number(r.user_id), r]));
  const children = new Map<number, Row[]>();
  for (const row of rows) {
    if (row.inviter === null) continue;
    const list = children.get(Number(row.inviter)) ?? [];
    list.push(row);
    children.set(Number(row.inviter), list);
  }

  /** Everyone below this person at any depth, which is not the same as the ones shown. */
  interface Below {
    all: number;
    joined: number;
    opened: number;
  }
  const totalsCache = new Map<number, Below>();
  function totals(id: number, seen: Set<number>): Below {
    const cached = totalsCache.get(id);
    if (cached) return cached;
    if (seen.has(id)) return { all: 0, joined: 0, opened: 0 };
    seen.add(id);
    let all = 0;
    let joined = 0;
    let opened = 0;
    for (const child of children.get(id) ?? []) {
      all += 1;
      if (!child.is_seat && child.joined_netai) joined += 1;
      if (!child.is_seat && child.opened_netai) opened += 1;
      const below = totals(Number(child.user_id), seen);
      all += below.all;
      joined += below.joined;
      opened += below.opened;
    }
    const out = { all, joined, opened };
    totalsCache.set(id, out);
    return out;
  }

  let budget = MAX_NODES;
  function build(row: Row, level: number, seen: Set<number>): ReferralNode {
    const id = Number(row.user_id);
    const below = totals(id, new Set(seen));
    const node: ReferralNode = {
      user_id: id,
      name: row.name,
      joined: row.joined,
      population: populationOf(row),
      invited_total: below.all,
      invited_who_joined_netai: below.joined,
      invited_who_opened_netai: below.opened,
      invited: [],
    };
    if (level >= wanted || seen.has(id)) return node;
    const next = new Set(seen).add(id);
    for (const child of children.get(id) ?? []) {
      if (budget <= 0) break;
      budget -= 1;
      node.invited.push(build(child, level + 1, next));
    }
    return node;
  }

  const rootRows =
    rootUserId === undefined
      ? // Everybody who invited somebody and was not themselves invited: the
        // tops of the forest, which is what „the tree" means with no name given.
        [...children.keys()]
          .map((id) => byId.get(id))
          .filter((r): r is Row => r !== undefined && r.inviter === null)
      : [byId.get(rootUserId)].filter((r): r is Row => r !== undefined);

  const roots = rootRows.map((r) => build(r, 0, new Set<number>()));

  return {
    roots,
    truncated: budget <= 0,
    counted: {
      invited_rows_in_all: rows.filter((r) => r.inviter !== null).length,
      of_them_joined_netai: rows.filter((r) => r.inviter !== null && r.joined_netai && !r.is_seat)
        .length,
      of_them_opened_netai: rows.filter((r) => r.inviter !== null && r.opened_netai && !r.is_seat)
        .length,
      of_them_test_seats: rows.filter((r) => r.inviter !== null && r.is_seat).length,
    },
  };
}
