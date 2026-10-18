const mockQuery = jest.fn();
jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => mockQuery(...args),
  withTransaction: jest.fn(),
  default: { end: jest.fn() },
}));

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildConnectorServer } from '../mcpServer';

/**
 * #5677: with the switch on, the connector must still build and list its tools.
 * A shared tool that fails to register would take the whole connector down.
 */
describe('the connector with the app’s tools switched on', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [{ enabled: true }], rowCount: 1 });
  });

  it('builds, and lists its own tools and the shared ones', async () => {
    const server = await buildConnectorServer('501');
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(clientSide);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);

    expect(names).toContain('search_contacts');
    expect(names).toContain('record_who_helped');
    expect(names).not.toContain('present_choices');
    const whoHelped = tools.find((t) => t.name === 'record_who_helped');
    expect(Object.keys(whoHelped?.inputSchema.properties ?? {})).toContain('contact_ref');
    expect(Object.keys(whoHelped?.inputSchema.properties ?? {})).not.toContain('phone');
    expect(new Set(names).size).toBe(names.length);
    await client.close();
  });
});
