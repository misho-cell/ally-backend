import { readFileSync } from 'fs';
import { join } from 'path';
import { MAX_CHAIN_POSITIONS_PER_CALL, threadIdsFrom } from '../threads.routes';

jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  default: {},
}));

const routes = readFileSync(join(__dirname, '..', 'threads.routes.ts'), 'utf8');

/** 4927 (a), Giorgi 14 Oct: every case card in the list shows its path, read in one call. */
describe('the list reads every card’s path in one call', () => {
  it('takes comma-separated positive ids, each once', () => {
    expect(threadIdsFrom('3,1,3,2')).toEqual([3, 1, 2]);
    expect(threadIdsFrom(' 7 ')).toEqual([7]);
  });

  it('refuses a missing, malformed or too long list', () => {
    expect(threadIdsFrom(undefined)).toBeNull();
    expect(threadIdsFrom('')).toBeNull();
    expect(threadIdsFrom('1,a')).toBeNull();
    expect(threadIdsFrom('0')).toBeNull();
    const tooMany = Array.from({ length: MAX_CHAIN_POSITIONS_PER_CALL + 1 }, (_, i) => i + 1);
    expect(threadIdsFrom(tooMany.join(','))).toBeNull();
  });

  it('is registered before the /:id routes, so „chain-positions" is never read as an id', () => {
    expect(routes.indexOf("'/chain-positions'")).toBeLessThan(routes.indexOf("'/:id/export'"));
    expect(routes.indexOf("'/chain-positions'")).toBeLessThan(
      routes.indexOf("'/:id/chain-position'"),
    );
  });
});
