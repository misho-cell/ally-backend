jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../pendingUpdates.service', () => ({
  __esModule: true,
  queueFollowUp: jest.fn().mockResolvedValue({ id: 1 }),
}));
jest.mock('../threads.service', () => ({
  __esModule: true,
  saveThreadMessage: jest.fn().mockResolvedValue(undefined),
}));

import { query } from '../../db/postgres/client';
import { queueFollowUp } from '../pendingUpdates.service';
import { saveThreadMessage } from '../threads.service';
import {
  renderWeeklySummary,
  sendWeeklySummary,
  WEEKLY_SUMMARY_KIND,
} from '../weeklySummary.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => jest.clearAllMocks());

describe('the words of the weekly summary', () => {
  it('says what happened, whatever the news, and admits what is not built', () => {
    const text = renderWeeklySummary(
      [
        {
          task_id: 1619,
          title: 'ბათუმის ფოტოგრაფი',
          thread_id: 9698,
          asks_sent: 0,
          asks_answered: 0,
          wakes: 3,
          next_wake_at: '2026-09-09T02:31:40Z',
          pending_question: null,
          routes: [{ name: 'ქსელში კითხვა', status: 'running' }],
        },
      ],
      42,
      0,
      '2026-08-31',
    );

    expect(text).toContain('აქტიური მიზნები: 1');
    expect(text).toContain('0 კითხვა გაიგზავნა, 0 პასუხი მოვიდა, 3 ავტომატური ნაბიჯი');
    expect(text).toContain('ქსელში კითხვა [running]');
    expect(text).toContain('2026-09-09-ს ვუბრუნდები');
    expect(text).toContain('ხარჯი ამ კვირაში: 42 ტოკენი');
    expect(text).toContain('შენი წესებით ავტომატურად გაცემული პასუხები: 0.');
  });

  it('a goal waiting on the user says so instead of a next step', () => {
    const text = renderWeeklySummary(
      [
        {
          task_id: 1,
          title: 'x',
          thread_id: 1,
          asks_sent: 1,
          asks_answered: 0,
          wakes: 0,
          next_wake_at: null,
          pending_question: 'რომელი თარიღი გირჩევნია?',
          routes: [],
        },
      ],
      0,
      0,
      '2026-08-31',
    );
    expect(text).toContain('გელოდება შენს პასუხს: „რომელი თარიღი გირჩევნია?"');
  });

  it('no open goal is still a summary, never silence', () => {
    expect(renderWeeklySummary([], 0, 0, '2026-08-31')).toContain('აქტიური მიზანი არ არის.');
  });
});

describe('sending it', () => {
  it('writes into every open goal thread and once into the pending list', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM tasks t'))
        return Promise.resolve({
          rows: [
            {
              id: 1619,
              title: 'ბათუმის ფოტოგრაფი',
              thread_id: 9698,
              brief: null,
              next_wake_at: null,
              pending_question: null,
              plan: null,
              plan_version: 0,
              plan_approved_at: null,
              asks_sent: '1',
              asks_answered: '1',
              wakes: '2',
            },
            {
              id: 1519,
              title: 'ლიკა',
              thread_id: 9406,
              brief: null,
              next_wake_at: null,
              pending_question: null,
              plan: null,
              plan_version: 0,
              plan_approved_at: null,
              asks_sent: '0',
              asks_answered: '0',
              wakes: '1',
            },
          ],
          rowCount: 2,
        } as never);
      if (sql.includes('FROM token_transactions'))
        return Promise.resolve({ rows: [{ spent: '17' }], rowCount: 1 } as never);
      return Promise.resolve({ rows: [], rowCount: 0 } as never);
    });

    const out = await sendWeeklySummary('501');

    expect(out.goals).toHaveLength(2);
    expect(out.tokens_spent).toBe(17);
    expect(saveThreadMessage).toHaveBeenCalledTimes(2);
    expect((saveThreadMessage as jest.Mock).mock.calls.map((c) => c[0])).toEqual([9698, 9406]);
    expect(queueFollowUp).toHaveBeenCalledTimes(1);
    const [userId, taskId, kind, payload, delay] = (queueFollowUp as jest.Mock).mock.calls[0];
    expect([userId, taskId, kind, delay]).toEqual(['501', null, WEEKLY_SUMMARY_KIND, 0]);
    expect(payload.text).toContain('აქტიური მიზნები: 2');
  });
});
