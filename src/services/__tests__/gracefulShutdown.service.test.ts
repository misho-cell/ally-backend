jest.mock('../cutOffRunNotice.service', () => ({
  __esModule: true,
  tellOwnersTheirRunWasCutOff: jest.fn().mockResolvedValue(0),
}));

import { tellOwnersTheirRunWasCutOff } from '../cutOffRunNotice.service';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  beginRun,
  DRAIN_BUDGET_MS,
  endRun,
  MEASURED_GRACE_MS,
  REPORT_RESERVE_MS,
  resetDrainState,
} from '../inFlightRuns';
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

/**
 * THE BUDGET IS OVERRIDABLE FROM THE ENVIRONMENT AND NOTHING CHECKED IT.
 *
 * `inFlightRuns` has a test holding „the wait plus the reporting fits inside
 * the grace". It runs in CI, where `DRAIN_BUDGET_MS` is unset. Set it to
 * twenty seconds in production and that test still passes while the process is
 * killed inside the wait — the original fault of 21 September, restored by
 * configuration, silently.
 *
 * So the check lives where the value actually is: once, at boot.
 */
describe('a budget that cannot fit inside the grace says so at boot', () => {
  it('checks the value before anything can use it', () => {
    const source = readFileSync(join(__dirname, '..', 'gracefulShutdown.service.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ' ');

    const install = code.indexOf('export function installShutdownHandlers');
    const check = code.indexOf('reportTheBudgetAgainstTheGrace()', install);
    const handler = code.indexOf('const shutdown =', install);

    expect(check).toBeGreaterThan(install);
    expect(check).toBeLessThan(handler);
  });

  it('says what to do about it, not merely that it is wrong', () => {
    const source = readFileSync(join(__dirname, '..', 'gracefulShutdown.service.ts'), 'utf8');

    expect(source).toContain('MISCONFIGURED');
    expect(source).toContain('Lower DRAIN_BUDGET_MS');
  });

  it('stays quiet when the numbers do fit, which is the shipped default', () => {
    expect(DRAIN_BUDGET_MS + REPORT_RESERVE_MS).toBeLessThanOrEqual(MEASURED_GRACE_MS);
  });
});
