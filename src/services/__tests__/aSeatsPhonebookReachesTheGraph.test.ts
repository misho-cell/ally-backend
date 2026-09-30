import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The seat's question (a), board 859: every fictional seat's second-circle
 * search answered „no_contacts_in_graph", because the first hop is read from
 * Neo4j and seat creation wrote only UserAlias. Source assertions, as for the
 * other seat-route guards: the write is an inner function behind two DBs.
 */
const src = readFileSync(join(__dirname, '..', 'testSeatCreate.service.ts'), 'utf8');

describe("a seat's phonebook reaches the graph the second circle walks", () => {
  it('writes the same CONTACT edge a phone sync writes', () => {
    expect(src).toContain('MERGE (u)-[r:CONTACT]->(c)');
    expect(src).toContain('MERGE (u:AllyNode {phoneKey: row.userKey})');
  });

  it('writes it right after the phonebook, for the same resolved contacts', () => {
    const phonebookAt = src.indexOf('const saved = await savePhonebook(userId, phonebook);');
    const graphAt = src.indexOf('await saveSeatGraph(userId, phonebook)');
    expect(phonebookAt).toBeGreaterThan(0);
    expect(graphAt).toBeGreaterThan(phonebookAt);
  });

  it('reports how many edges were written, instead of hiding a failure', () => {
    expect(src).toContain('graph_edges: graphEdges');
    expect(src).toContain('graph edges not written');
  });

  it('closes the graph session and sets a timeout', () => {
    expect(src).toMatch(/finally \{\s*await session\.close\(\);/);
    expect(src).toContain('timeout: SEAT_GRAPH_TIMEOUT_MS');
  });
});
