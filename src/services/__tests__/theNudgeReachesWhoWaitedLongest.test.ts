jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import {
  AI_NOTIFICATION_PUSH_URL,
  MAX_NUDGE_SEATS,
  NudgeSeatOutcome,
  nudgePushUrl,
  runNudgesForSeats,
} from '../aiNotification.service';
import { insideSendDay } from '../aiNotification.cron';

/**
 * #7921: the morning walk went through 11.5k subscribers by id from 05:00 and
 * died at a restart, so the high ids were never reached; a tap opened the chat
 * list, not the conversation.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => mockQuery.mockReset());

describe('the morning nudge walk (#7921)', () => {
  it('walks only people a push can reach, longest waiting first', () => {
    const cron = readFileSync(join(__dirname, '..', 'aiNotification.cron.ts'), 'utf8');
    expect(cron).toContain('EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id)');
    expect(cron).toContain('ORDER BY s.last_sent_at ASC NULLS FIRST, u.id');
  });

  it('starts again after a restart inside the sending day, not after it', () => {
    expect(insideSendDay(new Date('2026-10-28T07:30:00Z'))).toBe(true);
    expect(insideSendDay(new Date('2026-10-28T04:59:00Z'))).toBe(false);
    expect(insideSendDay(new Date('2026-10-28T15:00:00Z'))).toBe(false);
  });

  it('opens the conversation the nudge is about', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ thread_id: 63857 }], rowCount: 1 } as never);
    await expect(nudgePushUrl('118509')).resolves.toBe('/chat/63857');
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    await expect(nudgePushUrl('118509')).resolves.toBe(AI_NOTIFICATION_PUSH_URL);
  });

  it('runs on demand only on a handful of fictional seats', async () => {
    const tooMany = Array.from({ length: MAX_NUDGE_SEATS + 1 }, (_, i) => i + 1);
    await expect(runNudgesForSeats([])).resolves.toEqual({
      outcome: NudgeSeatOutcome.BadInput,
      ran: 0,
    });
    await expect(runNudgesForSeats(tooMany)).resolves.toEqual({
      outcome: NudgeSeatOutcome.BadInput,
      ran: 0,
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ n: 2 }], rowCount: 1 } as never);
    await expect(runNudgesForSeats([193815, 193817, 193819])).resolves.toEqual({
      outcome: NudgeSeatOutcome.NotATestSeat,
      ran: 0,
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
