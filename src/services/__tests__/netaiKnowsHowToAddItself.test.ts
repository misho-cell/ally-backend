jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  default: { end: jest.fn() },
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { NETAI_INFO_TOPICS } from '../tools/netaiInfo';
import { ALWAYS_ON_TOOLS } from '../chat.service';

const CONTENT = readFileSync(
  join(__dirname, '..', '..', 'db', 'postgres', 'migrations', '250_netai_info_connectors.sql'),
  'utf8',
);

/** #5776 (the founder's D824): asked how to add Netai to Claude or ChatGPT, Netai knows the steps. */
describe('the connectors topic', () => {
  it('is a topic the assistant is told it may read', () => {
    expect(NETAI_INFO_TOPICS).toContain('connectors');
    const tool = ALWAYS_ON_TOOLS.find((t) => t.name === 'get_netai_info');
    expect(tool?.input_schema.properties.topic.description).toContain('connectors');
  });

  it('carries the exact address and the steps for both, kept in step with the phone guide', () => {
    expect(CONTENT).toContain('https://api.netai.guru/mcp');
    expect(CONTENT).toContain('Customize → Connectors → Add custom connector');
    expect(CONTENT).toContain('Add custom MCP server');
    expect(CONTENT).toContain('api.allyapp.one');
    const guide = readFileSync(
      join(__dirname, '..', '..', '..', 'docs', 'NETAI_CONNECTOR_PHONE_GUIDE.md'),
      'utf8',
    );
    expect(guide).toContain('https://api.netai.guru/mcp');
  });

  it('keeps the screen’s English button names and the name Netai in any language (67488)', () => {
    const labels = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        'db',
        'postgres',
        'migrations',
        '251_netai_info_connectors_labels.sql',
      ),
      'utf8',
    );
    expect(labels).toContain('"Customize", "Connectors", "Add custom connector"');
    expect(labels).toContain('"Netai" in Latin letters');
    expect(labels).toContain("WHERE topic = 'connectors'");
  });
});
