jest.mock('../cutOffRunNotice.service', () => ({
  __esModule: true,
  tellOwnersTheirRunWasCutOff: jest.fn().mockResolvedValue(0),
}));

import { tellOwnersTheirRunWasCutOff } from '../cutOffRunNotice.service';
import { beginRun, endRun, resetDrainState } from '../inFlightRuns';
import { finishShutdown } from '../gracefulShutdown.service';

/** The real budget is eight seconds; nothing here is testing the wait itself. */
const DRAIN_BUDGET_IN_TESTS = 50;

const mockTell = tellOwnersTheirRunWasCutOff as jest.MockedFunction<
  typeof tellOwnersTheirRunWasCutOff
>;

let quietLog: jest.SpyInstance;
let quietError: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  resetDrainState();
  quietLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  quietError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  quietLog.mockRestore();
  quietError.mockRestore();
});

/**
 * THE WIRING, which is the half a sabotage run keeps finding untested.
 *
 * Three times on 21 September the same hole: a piece with ten tests of its own
 * and nothing holding it to the code that calls it. `cutOffRunNotice` has its
 * own file and every test there passes with the call deleted from here, so
 * this is the file that fails when the drain stops handing its list on.
 */
describe('what a shutdown does with what it could not save', () => {
  it('hands every cut-off run to the notice, with who and which thread', async () => {
    beginRun('r1', { kind: 'chat', userId: 171871, threadId: 21121 });

    await finishShutdown('SIGTERM', DRAIN_BUDGET_IN_TESTS);

    expect(mockTell).toHaveBeenCalledTimes(1);
    expect(mockTell.mock.calls[0][0]).toEqual([
      { runId: 'r1', kind: 'chat', userId: 171871, threadId: 21121 },
    ]);
  });

  it('names each one in the log, because a count named nobody', async () => {
    beginRun('r1', { kind: 'chat', userId: 171871, threadId: 21121 });

    await finishShutdown('SIGTERM', DRAIN_BUDGET_IN_TESTS);

    const said = quietError.mock.calls.map((call) => String(call[0])).join('\n');
    expect(said).toContain('user 171871');
    expect(said).toContain('thread 21121');
    expect(said).toContain('r1');
  });

  it('says nothing to anybody when the drain came back clean', async () => {
    await finishShutdown('SIGTERM', DRAIN_BUDGET_IN_TESTS);

    expect(mockTell).not.toHaveBeenCalled();
    expect(quietLog.mock.calls.map((call) => String(call[0])).join('\n')).toContain(
      'all runs finished',
    );
  });

  it('counts a run that finished inside the wait as saved, not as cut off', async () => {
    beginRun('r1', { kind: 'chat', userId: 501, threadId: 1 });
    endRun('r1');

    await finishShutdown('SIGTERM', DRAIN_BUDGET_IN_TESTS);

    expect(mockTell).not.toHaveBeenCalled();
  });
});
