import { getSession } from '../db/neo4j/client';
import { getCompositeKeysForPhones, getCompositeKeysForUsers } from './neo4j.keys';

const SEAT_GRAPH_TIMEOUT_MS = 15_000;

/**
 * ⚠️ THE SEAT'S PHONEBOOK NEVER REACHED THE GRAPH THE SECOND CIRCLE WALKS.
 *
 * The seat's question (a), board 859, 30 September: on every fictional seat,
 * search_second_degree answered „no_contacts_in_graph" — Test 46 holds six
 * members and the search found none of them. The first hop of the second
 * circle is read from Neo4j (`AllyNode -[:CONTACT]->`), and a real phone
 * sync writes both places (`saveToNeo4j` in contacts.service). This route
 * wrote only `UserAlias`, so no second-circle result on a seat had ever had
 * anything to search, and rows 278, 285, 286 and 296 could not be tested.
 *
 * So the seat's contacts are written to the graph too, the same MERGE the
 * sync uses. Seats only, by construction: this runs for a phonebook that
 * `resolvePhonebook` has already limited to recorded seats. The count is
 * returned, so a graph that could not be written is visible in the response
 * rather than discovered as another empty search.
 */
export async function saveSeatGraph(
  userId: string,
  resolved: ReadonlyMap<string, string>,
): Promise<number> {
  if (resolved.size === 0) return 0;
  const phones = [...resolved.keys()];
  const [userKeys, contactKeys] = await Promise.all([
    getCompositeKeysForUsers([Number(userId)]),
    getCompositeKeysForPhones(phones),
  ]);
  const userKey = userKeys.get(Number(userId));
  if (userKey === undefined) return 0;
  const rows = phones.map((phone) => ({
    userKey,
    contactKey: contactKeys.get(phone) ?? phone,
    name: resolved.get(phone) ?? '',
  }));
  const session = getSession();
  try {
    await session.run(
      `UNWIND $rows AS row
       MERGE (u:AllyNode {phoneKey: row.userKey})
       MERGE (c:AllyNode {phoneKey: row.contactKey})
       MERGE (u)-[r:CONTACT]->(c)
       SET r.name = row.name, r.updatedAt = datetime()`,
      { rows },
      { timeout: SEAT_GRAPH_TIMEOUT_MS },
    );
    return rows.length;
  } finally {
    await session.close();
  }
}

/**
 * 3104 (MASTER TEST RUN, SE-038 / SD-022, 2 of 2 owners): „who are my strongest
 * connectors?" found nobody on seats holding members with big phonebooks. The
 * graph showed why: the heavy seat had 3 of its 300 contacts there, and its
 * member friends had no edges at all. Seat creation wrote the graph; the two
 * routes that add contacts to a seat afterwards (one and in bulk) wrote only
 * Postgres, so the graph never saw them. They now write it too, and removal
 * takes the edges away. Test seats and fictional numbers only, as before.
 */
export async function removeSeatGraph(userId: string, phones: readonly string[]): Promise<number> {
  if (phones.length === 0) return 0;
  const [userKeys, contactKeys] = await Promise.all([
    getCompositeKeysForUsers([Number(userId)]),
    getCompositeKeysForPhones([...phones]),
  ]);
  const userKey = userKeys.get(Number(userId));
  if (userKey === undefined) return 0;
  const keys = phones.map((phone) => contactKeys.get(phone) ?? phone);
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (u:AllyNode {phoneKey: $userKey})-[r:CONTACT]->(c:AllyNode)
        WHERE c.phoneKey IN $keys
       DELETE r
       RETURN count(r) AS removed`,
      { userKey, keys },
      { timeout: SEAT_GRAPH_TIMEOUT_MS },
    );
    const removed: unknown = result.records[0]?.get('removed');
    return typeof removed === 'object' && removed !== null && 'toNumber' in removed
      ? (removed as { toNumber: () => number }).toNumber()
      : Number(removed ?? 0);
  } finally {
    await session.close();
  }
}

/** The graph write after a seat route's Postgres write: logged, never fatal to the route. */
export async function mirrorSeatGraph(
  userId: string,
  write: () => Promise<number>,
): Promise<number | null> {
  try {
    return await write();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[seat-graph] seat ${userId}: graph not written:`, (err as Error).message);
    return null;
  }
}
