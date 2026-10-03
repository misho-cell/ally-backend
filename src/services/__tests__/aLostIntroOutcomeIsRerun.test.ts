jest.mock('../engineWakes.service', () => ({
  __esModule: true,
  DAY_ONE_WAKE: 'day_one',
  INTRO_OUTCOME_WAKE: 'intro_outcome',
  abandonExhaustedWakes: jest.fn(),
  claimOverdueWakes: jest.fn(),
}));
jest.mock('../taskEngine.service', () => ({
  __esModule: true,
  startDayOne: jest.fn(),
  startIntroOutcome: jest.fn(),
  isEventText: jest.requireActual('../taskEngine.service').isEventText,
}));

import { abandonExhaustedWakes, claimOverdueWakes } from '../engineWakes.service';
import { isEventText, startDayOne, startIntroOutcome } from '../taskEngine.service';
import { startEngineWakeCron, TICK_INTERVAL_MS } from '../engineWakes.cron';

const mockAbandon = abandonExhaustedWakes as jest.MockedFunction<typeof abandonExhaustedWakes>;
const mockClaim = claimOverdueWakes as jest.MockedFunction<typeof claimOverdueWakes>;
const mockIntro = startIntroOutcome as jest.MockedFunction<typeof startIntroOutcome>;
const mockDayOne = startDayOne as jest.MockedFunction<typeof startDayOne>;

/**
 * The tester's 1100 (request 2839, goal 14966): an introduction was accepted
 * six seconds before a deploy's SIGTERM, and its outcome wake, a timer only,
 * was lost. The sweeper now re-runs it with the words it was recorded with.
 */
describe('a lost introduction outcome', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockAbandon.mockResolvedValue(0);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function tick(): Promise<void> {
    startEngineWakeCron();
    await jest.advanceTimersByTimeAsync(TICK_INTERVAL_MS);
  }

  it('is run again, at once, with the words it carried', async () => {
    const words = { ka: 'გიორგიმ თანხმობა მისცა', en: 'Giorgi said yes' };
    mockClaim.mockResolvedValueOnce([
      { id: '1', taskId: 14966, kind: 'intro_outcome', attempts: 1, eventText: words },
    ]);
    await tick();
    expect(mockIntro).toHaveBeenCalledWith(14966, words, 0);
    expect(mockDayOne).not.toHaveBeenCalled();
  });

  it('is not run when the row carries no words', async () => {
    mockClaim.mockResolvedValueOnce([
      { id: '2', taskId: 15000, kind: 'intro_outcome', attempts: 1, eventText: null },
    ]);
    await tick();
    expect(mockIntro).not.toHaveBeenCalled();
  });
});

describe('what counts as event words', () => {
  it('takes one sentence or one per language', () => {
    expect(isEventText('Giorgi said yes')).toBe(true);
    expect(isEventText({ ka: 'კი', en: 'yes' })).toBe(true);
  });

  it('refuses nothing, an empty sentence, a list or a number', () => {
    expect(isEventText(null)).toBe(false);
    expect(isEventText('  ')).toBe(false);
    expect(isEventText(['yes'])).toBe(false);
    expect(isEventText({ ka: 3 })).toBe(false);
    expect(isEventText({})).toBe(false);
  });
});
