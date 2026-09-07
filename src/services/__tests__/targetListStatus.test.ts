jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../unmetNeeds.service', () => ({ __esModule: true, findUnmetNeeds: jest.fn() }));

import { query } from '../../db/postgres/client';
import { findUnmetNeeds } from '../unmetNeeds.service';
import {
  buildTargetListWithGates,
  clearTargetListCache,
  startTargetListBuild,
  targetListStatus,
} from '../targetScoring.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockNeeds = findUnmetNeeds as jest.MockedFunction<typeof findUnmetNeeds>;

/** Lets a queued promise chain settle without touching real timers. */
const settle = (): Promise<void> => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.clearAllMocks();
  clearTargetListCache();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
});

// Ticket 10 Task 12: the 60-day period's first build took 68 s and the page
// showed a server error with nothing cached and nothing to retry.
describe('a build that does not hold the reader', () => {
  it('is not_built until asked, building while it runs, ready when it lands', async () => {
    let finish!: () => void;
    mockNeeds.mockReturnValue(new Promise((r) => (finish = () => r([]))) as never);

    expect(targetListStatus(60).state).toBe('not_built');
    const started = startTargetListBuild(60);
    expect(started.state).toBe('building');
    expect(started.building_since).not.toBeNull();

    finish();
    await settle();
    await settle();

    const done = targetListStatus(60);
    expect(done.state).toBe('ready');
    expect(done.built_at).not.toBeNull();
    expect(done.last_error).toBeNull();
  });

  it('a failed build is reported as failed, with the reason, not as a 500 to the reader', async () => {
    mockNeeds.mockRejectedValue(new Error('statement timeout'));

    startTargetListBuild(60);
    await settle();
    await settle();

    const status = targetListStatus(60);
    expect(status.state).toBe('failed');
    expect(status.last_error?.message).toBe('statement timeout');
    // A retry is one more start — nothing is stuck.
    mockNeeds.mockResolvedValue([]);
    startTargetListBuild(60);
    await settle();
    await settle();
    expect(targetListStatus(60).state).toBe('ready');
  });

  it('two readers arriving during one build join it rather than starting a second', async () => {
    let finish!: () => void;
    mockNeeds.mockReturnValue(new Promise((r) => (finish = () => r([]))) as never);

    const a = buildTargetListWithGates(30);
    const b = buildTargetListWithGates(30);
    startTargetListBuild(30);
    finish();
    await Promise.all([a, b]);

    expect(mockNeeds).toHaveBeenCalledTimes(1);
  });

  it('a fresh cache starts nothing', async () => {
    mockNeeds.mockResolvedValue([]);
    await buildTargetListWithGates(14);
    mockNeeds.mockClear();

    expect(startTargetListBuild(14).state).toBe('ready');
    expect(mockNeeds).not.toHaveBeenCalled();
  });
});
