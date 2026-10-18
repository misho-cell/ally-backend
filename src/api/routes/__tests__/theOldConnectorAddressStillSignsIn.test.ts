jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  default: { end: jest.fn() },
}));

import { connectorOriginFor } from '../../../config/publicUrl';
import { protectedResourceMetadataFor } from '../oauth.routes';

/** #5677 (the tester's 67142): people who added the connector as „Ally" still sign in at the old host. */
describe('the connector’s resource address', () => {
  it('is the address the client called, for each of our hosts', () => {
    expect(protectedResourceMetadataFor('api.allyapp.one').resource).toBe(
      'https://api.allyapp.one/mcp',
    );
    expect(protectedResourceMetadataFor('api.netai.guru').resource).toBe(
      'https://api.netai.guru/mcp',
    );
  });

  it('keeps one authorization server', () => {
    expect(protectedResourceMetadataFor('api.allyapp.one').authorization_servers).toEqual([
      'https://api.netai.guru',
    ]);
  });

  it('never echoes a host that is not ours', () => {
    expect(connectorOriginFor('evil.example')).toBe('https://api.netai.guru');
    expect(connectorOriginFor(undefined)).toBe('https://api.netai.guru');
    expect(connectorOriginFor('API.ALLYAPP.ONE')).toBe('https://api.allyapp.one');
  });
});
