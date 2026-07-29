import { isBlockedFetchHost } from '../webSearch';

describe('isBlockedFetchHost — SSRF guard for the direct-fetch fallback', () => {
  it.each([
    'localhost',
    '127.0.0.1',
    '10.0.0.5',
    '192.168.1.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '0.0.0.0',
    'metadata.internal',
    'printer.local',
  ])('blocks %s', (host) => {
    expect(isBlockedFetchHost(host)).toBe(true);
  });

  it.each(['tbilisi.gov.ge', 'saburtalo.tbilisi.gov.ge', 'parliament.ge', 'example.com'])(
    'allows %s',
    (host) => {
      expect(isBlockedFetchHost(host)).toBe(false);
    },
  );
});
