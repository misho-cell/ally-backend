jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../../../db/neo4j/client', () => ({ getSession: jest.fn(), __esModule: true }));
jest.mock('../../neo4j.keys', () => ({
  __esModule: true,
  getCompositeKeyForUser: jest.fn().mockResolvedValue('+995500000001'),
  getCompositeKeyForPhone: jest.fn().mockResolvedValue('+995500000009'),
}));
jest.mock('../../block.service', () => ({
  __esModule: true,
  getExcludedPhones: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../memberPaths.service', () => ({
  __esModule: true,
  memberMiddles: jest.fn().mockResolvedValue([]),
}));
jest.mock('../membership', () => ({
  __esModule: true,
  fetchAccountStates: jest.fn().mockResolvedValue(new Map()),
  isMemberPhone: jest.fn(() => true),
  accountStateFor: jest.fn(() => 'netai_user'),
}));

import { query } from '../../../db/postgres/client';
import { getSession } from '../../../db/neo4j/client';
import { findWarmPath } from '../findWarmPath';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSession = getSession as jest.MockedFunction<typeof getSession>;

const ME = '+995500000001';
const TARGET = '+995500000009';
const FIVE_HOPS = [ME, '+995500000002', '+995500000003', '+995500000004', '+995500000005', TARGET];

/** One answer per walk, in order; an Error rejects that walk. */
function graphAnswering(...walks: (string[][] | Error)[]): jest.Mock {
  const run = jest.fn();
  for (const walk of walks) {
    if (walk instanceof Error) run.mockRejectedValueOnce(walk);
    else
      run.mockResolvedValueOnce({ records: walk.map((keys) => ({ get: (): string[] => keys })) });
  }
  mockSession.mockReturnValue({ run, close: jest.fn().mockResolvedValue(undefined) } as never);
  return run;
}

function depthOf(run: jest.Mock, call: number): number {
  const cypher = run.mock.calls[call][0] as string;
  return Number(/CONTACT\*1\.\.(\d+)/.exec(cypher)?.[1]);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
});

/** 5347 (the founder's word, 16 Oct): 3rd, 4th and 5th degree, assistant to assistant. */
describe('the walk reaches the fifth degree', () => {
  it('walks on to 5 hops when nothing is within 3, and returns that route', async () => {
    const run = graphAnswering([], [FIVE_HOPS]);

    const out = await findWarmPath('1', TARGET);

    expect(out.found).toBe(true);
    expect((out as { paths: { hops: number }[] }).paths[0].hops).toBe(5);
    expect([depthOf(run, 0), depthOf(run, 1)]).toEqual([3, 5]);
  });

  it('does not walk further when a route within 3 hops exists', async () => {
    const run = graphAnswering([[ME, '+995500000002', TARGET]]);

    await findWarmPath('1', TARGET);

    expect(run).toHaveBeenCalledTimes(1);
    expect(depthOf(run, 0)).toBe(3);
  });

  it('keeps the near answer, not an outage, when the long walk runs out of time', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    graphAnswering([], new Error('transaction timed out'));

    const out = await findWarmPath('1', TARGET);

    expect(out.found).toBe(false);
    expect((out as { reason: string }).reason).toBe('no_path_within_hops');
  });

  it('never walks deeper than 5, whatever is asked', async () => {
    const run = graphAnswering([], []);

    await findWarmPath('1', TARGET, 9);

    expect(depthOf(run, 1)).toBe(5);
  });
});
