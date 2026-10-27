jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../chat.service', () => ({ __esModule: true, processChat: jest.fn() }));
jest.mock('../threads.service', () => ({ __esModule: true, createThread: jest.fn() }));
jest.mock('../productEvents.service', () => ({
  __esModule: true,
  recordProductEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../sse.service', () => ({
  __esModule: true,
  emitRunComplete: jest.fn(),
  emitThreadCreated: jest.fn(),
}));
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));

import { query } from '../../db/postgres/client';
import { processChat } from '../chat.service';
import { createThread } from '../threads.service';
import { recordProductEvent } from '../productEvents.service';
import { sendPushNotification } from '../notification.service';
import {
  AFTER_DECLINE_EVENT,
  AFTER_DECLINE_EVENT_BODY,
  helpersDueAfterDecline,
  MAX_SEATS_PER_RUN,
  runAfterDecline,
  runAfterDeclineForSeats,
  SeatRunOutcome,
} from '../afterDecline.service';
import { isAfterDeclineHour } from '../afterDecline.cron';

/**
 * #8086 (founder 25 Oct, W7): the day after a helper declines, ONE new
 * conversation thanks them and asks about their own goal — nothing from the
 * asker's goal reaches them.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockChat = processChat as jest.MockedFunction<typeof processChat>;

beforeEach(() => {
  jest.clearAllMocks();
  (createThread as jest.Mock).mockResolvedValue({
    id: 80001,
    type: 'regular',
    title: 'Netai',
    is_task: false,
    status: 'idle',
    status_line: null,
  });
  mockChat.mockResolvedValue({ reply: 'მადლობა პასუხისთვის. რაზე მუშაობ ახლა?' } as never);
});

describe('the day after a decline (#8086)', () => {
  it('reads only real members, once a week, never twice in a day', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 5 }], rowCount: 1 } as never);
    await expect(helpersDueAfterDecline(null)).resolves.toEqual([5]);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('NOT EXISTS (SELECT 1 FROM test_seats ts');
    expect(String(sql)).toContain('e.event = $4');
    expect(String(sql)).toContain("date_trunc('day', NOW() AT TIME ZONE 'Asia/Tbilisi')");
    expect(params).toEqual([null, 48, 24, AFTER_DECLINE_EVENT, 7, 30]);
  });

  it('opens one conversation, records it before the run, and lets the model write', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 5 }], rowCount: 1 } as never);

    await expect(runAfterDecline()).resolves.toBe(1);

    expect(createThread).toHaveBeenCalledTimes(1);
    expect(recordProductEvent).toHaveBeenCalledWith(5, AFTER_DECLINE_EVENT, { thread_id: 80001 });
    expect(mockChat).toHaveBeenCalledWith(
      '5',
      80001,
      `[მოვლენა] ${AFTER_DECLINE_EVENT_BODY}`,
      expect.any(String),
    );
    expect(sendPushNotification).toHaveBeenCalledWith(
      '5',
      expect.objectContaining({ url: '/chat/80001' }),
    );
  });

  it('gives the model nothing from the asker’s goal', () => {
    expect(AFTER_DECLINE_EVENT_BODY).toContain('არც ერთი სახელი');
    expect(AFTER_DECLINE_EVENT_BODY).not.toMatch(/\d/u);
  });

  it('sends no push when the model wrote nothing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 5 }], rowCount: 1 } as never);
    mockChat.mockResolvedValueOnce({ reply: '', runFailed: true } as never);

    await expect(runAfterDecline()).resolves.toBe(0);
    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it('runs once a day, at 14:00 Tbilisi', () => {
    expect(isAfterDeclineHour(new Date('2026-10-28T10:05:00Z'), null)).toBe(true);
    expect(isAfterDeclineHour(new Date('2026-10-28T10:05:00Z'), '2026-10-28')).toBe(false);
    expect(isAfterDeclineHour(new Date('2026-10-28T22:05:00Z'), null)).toBe(false);
  });

  it('runs on demand only on a handful of fictional seats', async () => {
    const tooMany = Array.from({ length: MAX_SEATS_PER_RUN + 1 }, (_, i) => i + 1);
    await expect(runAfterDeclineForSeats([])).resolves.toEqual({
      outcome: SeatRunOutcome.BadInput,
      opened: 0,
    });
    await expect(runAfterDeclineForSeats(tooMany)).resolves.toEqual({
      outcome: SeatRunOutcome.BadInput,
      opened: 0,
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ n: 1 }], rowCount: 1 } as never);
    await expect(runAfterDeclineForSeats([181341, 181343])).resolves.toEqual({
      outcome: SeatRunOutcome.NotATestSeat,
      opened: 0,
    });
    expect(createThread).not.toHaveBeenCalled();
  });

  it('opens the seat’s conversation from any decline it made', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ n: 1 }], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [{ user_id: 181341 }], rowCount: 1 } as never);
    await expect(runAfterDeclineForSeats([181341])).resolves.toEqual({
      outcome: SeatRunOutcome.Ran,
      opened: 1,
    });
    expect(mockQuery.mock.calls[1][1]).toEqual([[181341], 48, 24, AFTER_DECLINE_EVENT, 7, 30]);
  });
});
