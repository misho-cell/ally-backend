import { query } from '../db/postgres/client';
import { IS_MEMBER_SQL } from './memberPaths.service';
import { normalizePhone } from './phone';
import { labelsAlongChain } from './chainLabels';
import { namesFor } from './tools/findWarmPath';
import { georgianStem } from './tools/georgianStem';
import { normalizeSearchToken } from './tools/normalizeSearchToken';
import { NETAI_ACTIVE_SUBSCRIPTION_STATUSES } from './tools/membership';

/**
 * 5347 (the founder's word, 16 Oct; the tester's 63203, 0 of 4). 0372 let
 * find_warm_path walk five hops, but it walks only to a person already found,
 * and the searches stop at the second circle. A notary saved only by the fourth
 * friend in a chain, or „Zurab Kobuladze" named by the owner, was never found,
 * so no path was ever asked for.
 *
 * This looks further, only when the owner's own phonebook and the second circle
 * have nothing: ring by ring through people who use Netai (a request travels
 * assistant to assistant, so nobody else can carry it), up to four people in
 * the middle, five hops. A person saved by someone in the third ring or beyond
 * under the words asked for comes back with the chain that reaches them.
 */
const MAX_PEOPLE_IN_THE_MIDDLE = 4;
/** The second circle is the second-degree search's; from here on is further out. */
const FIRST_RING_SEARCHED_HERE = 2;
const PEOPLE_PER_RING = 300;
const HITS_READ = 20;
export const HITS_SHOWN = 5;
const MIN_WORD_CHARS = 3;
const QUERY_TIMEOUT_MS = 8_000;

interface Link {
  readonly userId: number;
  /** The phone the person before them saved them under. */
  readonly phone: string;
  readonly before: Link | null;
}

export interface FarHit {
  /** The label the last person in the chain saved them under. */
  readonly name: string;
  readonly phone: string;
  readonly hops: number;
  /** The owner's own contact the chain starts at: the one the owner's plan asks. */
  readonly firstLinkPhone: string;
  /** The people in the middle, first link first; null where no name is known (never a number). */
  readonly via: readonly (string | null)[];
}

interface HitRow {
  readonly holder_id: number;
  readonly phone: string;
  readonly alias: string;
}

/** Each word of the query as a pattern the database compares labels by; short words are dropped. */
export function wordPatterns(text: string): string[] {
  return text
    .split(/[\s,.;:!?„"“”()]+/u)
    .map((word) => georgianStem(word.trim()))
    .filter((word) => [...word].length >= MIN_WORD_CHARS)
    .map((word) => `%${normalizeSearchToken(word)}%`);
}

/** The chain from the first link to this one, as phones; the owner at its root is not a link. */
function chainOf(link: Link): string[] {
  const phones: string[] = [];
  for (let at: Link = link; at.before !== null; at = at.before) phones.unshift(at.phone);
  return phones;
}

/** The Netai members saved by this ring, each met once. */
async function nextRing(ring: readonly Link[], seen: Set<number>): Promise<Link[]> {
  const byId = new Map(ring.map((link) => [link.userId, link]));
  const result = await query<{ from_id: number; user_id: number; phone: string }>(
    `SELECT DISTINCT ON (up."userId") ua."contactId" AS from_id, up."userId" AS user_id, ua.phone
       FROM "UserAlias" ua JOIN "UserPhone" up ON up.phone = ua.phone
      WHERE ua."contactId" = ANY($1::int[]) AND NOT (up."userId" = ANY($2::int[]))
        AND ${IS_MEMBER_SQL('up."userId"', '$4')}
      LIMIT $3`,
    [[...byId.keys()], [...seen], PEOPLE_PER_RING, NETAI_ACTIVE_SUBSCRIPTION_STATUSES],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.flatMap((row) => {
    const before = byId.get(Number(row.from_id));
    if (before === undefined || seen.has(Number(row.user_id))) return [];
    seen.add(Number(row.user_id));
    return [{ userId: Number(row.user_id), phone: row.phone, before }];
  });
}

/**
 * People this ring saved under every one of the words — in the label itself, or
 * in a tag the holder gave them (the tester's 63264: „ნოტარიუსი ქუთაისში" was
 * L2's tag on a contact saved by name). Named by the holder's label when there is one.
 */
async function savedUnder(ring: readonly Link[], patterns: readonly string[]): Promise<HitRow[]> {
  const result = await query<HitRow>(
    `SELECT x.holder_id, x.phone, x.alias
       FROM (
         SELECT ua."contactId" AS holder_id, ua.phone, ua.alias,
                normalize_search_token(ua.alias) AS words
           FROM "UserAlias" ua
          WHERE ua."contactId" = ANY($1::int[])
         UNION ALL
         SELECT ut."contactId", ut.phone,
                COALESCE(
                  (SELECT NULLIF(TRIM(a.alias), '') FROM "UserAlias" a
                    WHERE a."contactId" = ut."contactId" AND a.phone = ut.phone
                    ORDER BY a.id DESC LIMIT 1),
                  ut.tag),
                normalize_search_token(ut.tag)
           FROM "UserTags" ut
          WHERE ut."contactId" = ANY($1::int[])
       ) x
      WHERE x.words LIKE ALL($2::text[])
      LIMIT $3`,
    [ring.map((link) => link.userId), patterns, HITS_READ],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** The rings out to the furthest, the owner's own members first. */
async function ringsFrom(ownerId: number): Promise<Link[][]> {
  const seen = new Set<number>([ownerId]);
  const rings: Link[][] = [];
  let ring: Link[] = [{ userId: ownerId, phone: '', before: null }];
  for (let depth = 1; depth <= MAX_PEOPLE_IN_THE_MIDDLE && ring.length > 0; depth += 1) {
    ring = await nextRing(ring, seen);
    rings.push(ring);
  }
  return rings;
}

/** Raw hits, nearest ring first, one per person. */
async function hitsFrom(
  rings: readonly Link[][],
  patterns: readonly string[],
): Promise<{ readonly link: Link; readonly row: HitRow }[]> {
  const found = new Map<string, { readonly link: Link; readonly row: HitRow }>();
  for (let index = FIRST_RING_SEARCHED_HERE - 1; index < rings.length; index += 1) {
    const ring = rings[index];
    if (ring.length === 0) continue;
    const byId = new Map(ring.map((link) => [link.userId, link]));
    for (const row of await savedUnder(ring, patterns)) {
      const link = byId.get(Number(row.holder_id));
      const phone = normalizePhone(row.phone);
      if (link === undefined || found.has(phone)) continue;
      found.set(phone, { link, row });
    }
    if (found.size >= HITS_SHOWN) break;
  }
  return [...found.values()].slice(0, HITS_SHOWN);
}

/** Who, beyond the second circle, is saved under these words, with the chain of members to them. */
export async function farMembersHolding(ownerId: number, text: string): Promise<FarHit[]> {
  const patterns = wordPatterns(text);
  if (patterns.length === 0) return [];
  const hits = await hitsFrom(await ringsFrom(ownerId), patterns);
  if (hits.length === 0) return [];
  const chains = hits.map(({ link }) => chainOf(link));
  const [names, labels] = await Promise.all([
    namesFor(String(ownerId), [...new Set(chains.flat())]),
    Promise.all(chains.map((chain) => labelsAlongChain(ownerId, chain))),
  ]);
  return hits.map(({ row }, index) => ({
    name: row.alias,
    phone: normalizePhone(row.phone),
    hops: chains[index].length + 1,
    firstLinkPhone: normalizePhone(chains[index][0]),
    via: chains[index].map(
      (phone, at) => labels[index][at] ?? names.get(normalizePhone(phone)) ?? null,
    ),
  }));
}
