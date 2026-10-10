jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { FIRST_RUN_AFTER_START_MS, startSubscriptionCron } from '../subscription.cron';
import { DAILY_JOBS_AFTER_START_MS } from '../chorusCampaign.cron';

const mockQuery = query as jest.MockedFunction<typeof query>;
const DEPLOY_GAP_MS = 30 * 60 * 1000;

/**
 * 4295 (plate NEW-4): two timers never ran — each waited its whole interval
 * (5 h, a day) before the first run, and the server is deployed more often.
 */
describe('a timer runs between deploys', () => {
  afterEach(() => jest.useRealTimers());

  it('handles ended trials within minutes of a start, well before the next deploy', async () => {
    jest.useFakeTimers();
    mockQuery.mockResolvedValue({ rowCount: 0, rows: [] } as never);
    startSubscriptionCron();
    expect(mockQuery).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(FIRST_RUN_AFTER_START_MS);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(String(mockQuery.mock.calls[0][0])).toContain("subscription_status = 'trialing'");
    expect(FIRST_RUN_AFTER_START_MS).toBeLessThan(DEPLOY_GAP_MS);
  });

  it('runs the daily campaign jobs soon after start too, not a day later', () => {
    expect(DAILY_JOBS_AFTER_START_MS).toBeLessThan(DEPLOY_GAP_MS);
    const cron = readFileSync(join(__dirname, '..', 'chorusCampaign.cron.ts'), 'utf8');
    for (const job of ['queueWarmTieQuestions', 'prunePushDeliveries', 'sweepStaleParticipants']) {
      const at = cron.indexOf(`void ${job}(`);
      expect(cron.lastIndexOf('soonThenEvery(', at)).toBeGreaterThan(
        cron.lastIndexOf('setInterval(', at),
      );
    }
  });
});
