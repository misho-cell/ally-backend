jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../pendingUpdates.service', () => ({ __esModule: true, queueFollowUp: jest.fn() }));

import { query } from '../../db/postgres/client';
import { queueFollowUp } from '../pendingUpdates.service';
import {
  queueWorkNewsQuestions,
  startWorkNewsQuestions,
  WORK_NEWS_INSTRUCTION,
  WORK_NEWS_KIND,
  WORK_NEWS_QUESTION,
  WORK_NEWS_QUESTION_ON,
} from '../workNewsQuestion.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockQueue = queueFollowUp as jest.MockedFunction<typeof queueFollowUp>;

/** 4126 6d (§129): „სამსახურში რამე სიახლეა?" at most once a month, instead of research. */
describe('the monthly work question', () => {
  beforeEach(() => jest.resetAllMocks());

  it('is ON since Misho’s yes (§129); switched off, nothing is queued', async () => {
    expect(WORK_NEWS_QUESTION_ON).toBe(true);
    expect(await queueWorkNewsQuestions(200, false)).toBe(0);
    expect(startWorkNewsQuestions(false)).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is the approved sentence, word for word', () => {
    expect(WORK_NEWS_INSTRUCTION).toBe(
      "When the conversation has room for it — never as the opening line — ask once, in the user's " +
        'language: „სამსახურში რამე სიახლეა?" Save what they say about their own work; if they ' +
        'would rather not say, drop it.',
    );
  });

  it('carries the approved question word for word', () => {
    expect(WORK_NEWS_QUESTION).toBe('სამსახურში რამე სიახლეა?');
    expect(WORK_NEWS_INSTRUCTION).toContain(`„${WORK_NEWS_QUESTION}"`);
  });

  it('when on, asks each due user once, never twice in 30 days, never a test seat', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 7 }, { user_id: 8 }] } as never);
    mockQueue.mockResolvedValue({ id: 1 });
    expect(await queueWorkNewsQuestions(200, true)).toBe(2);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('p.kind = $2');
    expect(params).toEqual([200, WORK_NEWS_KIND, 30]);
    expect(mockQueue).toHaveBeenCalledWith(
      '7',
      null,
      WORK_NEWS_KIND,
      expect.objectContaining({ instruction: WORK_NEWS_INSTRUCTION }),
      0,
    );
  });
});
