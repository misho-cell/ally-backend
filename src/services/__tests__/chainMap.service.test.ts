jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../db/neo4j/client', () => ({ __esModule: true, getSession: jest.fn() }));
jest.mock('../neo4j.keys', () => ({
  __esModule: true,
  getCompositeKeyForUser: jest.fn(() => Promise.resolve('995500000000')),
  getCompositeKeyForPhone: jest.fn(() => Promise.resolve('995500000009')),
}));
jest.mock('../block.service', () => ({
  __esModule: true,
  getExcludedPhones: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../mcp/contactRef', () => ({
  __esModule: true,
  decodeContactRef: jest.fn((_o: string, ref: string) => (ref === 'c_t' ? '995500000009' : null)),
  encodeContactRef: jest.fn((_o: string, phone: string) => `c_${phone.slice(-1)}`),
}));
jest.mock('../tools/findWarmPath', () => ({
  __esModule: true,
  namesFor: jest.fn(() => Promise.resolve(new Map())),
}));
jest.mock('../tools/membership', () => ({
  __esModule: true,
  fetchAccountStates: jest.fn(() => Promise.resolve(new Map())),
  accountDetailsFor: jest.fn((_s: unknown, phone: string) =>
    phone.endsWith('3')
      ? { state: 'none', user_id: null }
      : { state: 'netai_user', user_id: Number(phone.slice(-1)) },
  ),
}));

import { query } from '../../db/postgres/client';
import { getSession } from '../../db/neo4j/client';
import { chainMapsFor } from '../chainMap.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function graph(paths: string[][]): void {
  (getSession as jest.Mock).mockReturnValue({
    run: jest.fn(() =>
      Promise.resolve({
        records: paths.map((keys) => ({ get: () => ['995500000000', ...keys, '995500000009'] })),
      }),
    ),
    close: jest.fn(() => Promise.resolve()),
  });
}

/** Task 1849, stage one (§127). */
describe('the maps to a named person', () => {
  beforeEach(() => mockQuery.mockReset());

  it('drops a path through a non-member, and one with a blocked step', async () => {
    graph([['995500000001', '995500000002'], ['995500000003'], ['995500000004']]);
    // Steps of [1,2] are 1..3, of [4] are 4..5; the step into 4 is blocked.
    mockQuery.mockResolvedValue({
      rows: [
        { i: 1, warm: true, blocked: false },
        { i: 2, warm: false, blocked: false },
        { i: 3, warm: false, blocked: false },
        { i: 4, warm: false, blocked: true },
        { i: 5, warm: false, blocked: false },
      ],
    } as never);
    const maps = await chainMapsFor(171, 'c_t');
    expect(maps).toHaveLength(1);
    expect(maps?.[0].links.map((l) => l.id)).toEqual([null, 'c_1', 'c_2', 'c_9']);
    expect(maps?.[0].warm_steps).toBe(1);
  });

  it('is null for a foreign id, and empty when the graph has no path', async () => {
    await expect(chainMapsFor(171, 'c_other')).resolves.toBeNull();
    graph([]);
    await expect(chainMapsFor(171, 'c_t')).resolves.toEqual([]);
  });
});
