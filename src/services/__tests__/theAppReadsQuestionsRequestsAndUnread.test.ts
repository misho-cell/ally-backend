jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { coreQuestions, QuestionLanguage, questionLanguage } from '../coreQuestions.service';
import { myIntroRequests, MyRequestState } from '../myIntroRequests.service';
import { markThreadUnread } from '../threads.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => mockQuery.mockReset());

/** The frontend's 14 Oct 14:10Z item 4: the core questions together, answered or not. */
describe('the core questions', () => {
  it('gives each question in the asked language with its reason and the person’s answer', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          question_id: 'core_can_help_002',
          prompt_ka: 'რაში შეგიძლია სხვებს დაეხმარო?',
          prompt_en: 'What can you help other people with?',
          prompt_es: null,
          immediate_use_ka: 'პირველად შენზე ვიფიქრებ.',
          immediate_use_en: 'I will think of you first.',
          immediate_use_es: null,
          answer: 'tax law',
          answered: true,
        },
      ],
    } as never);

    const [q] = await coreQuestions(171, QuestionLanguage.En);
    expect(q).toEqual({
      question_id: 'core_can_help_002',
      text: 'What can you help other people with?',
      reason: 'I will think of you first.',
      answered: true,
      answer: 'tax law',
    });
    expect(mockQuery.mock.calls[0][1]).toEqual([171, 'core', expect.any(Number)]);
  });

  it('reads an unknown language as Georgian', () => {
    expect(questionLanguage('fr')).toBe(QuestionLanguage.Ka);
    expect(questionLanguage('es')).toBe(QuestionLanguage.Es);
  });
});

/** Item 5: the introductions this person asked for, with a plain state. */
describe('my introduction requests', () => {
  it('gives no expiry once a request is answered', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 10,
          mediator_name: null,
          target_name: 'Nino',
          goal_id: null,
          thread_id: null,
          status: 'accepted',
          created_at: '2026-10-01T10:00:00Z',
          answered_at: '2026-10-02T10:00:00Z',
        },
      ],
    } as never);

    const [r] = await myIntroRequests(171);
    expect(r).toMatchObject({ state: MyRequestState.Accepted, expires_at: null });
  });

  it('reads only the person’s own requests and names the state plainly', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 9,
          mediator_name: 'Levan',
          target_name: 'Beka',
          goal_id: 44,
          thread_id: 51592,
          status: 'pending',
          created_at: '2026-10-14T10:00:00Z',
          answered_at: null,
        },
      ],
    } as never);

    const [r] = await myIntroRequests(171);
    expect(r).toMatchObject({
      id: 9,
      mediator_name: 'Levan',
      state: MyRequestState.Sent,
      answered_at: null,
    });
    expect(String(mockQuery.mock.calls[0][0])).toContain('WHERE ir.requester_user_id = $1');
    // The frontend's 15:05Z: a waiting request says when it runs out (14 days).
    expect(r.expires_at).toBe('2026-10-28T10:00:00.000Z');
  });
});

/** Item 7: „წაუკითხავად მონიშვნა". */
describe('marking a conversation unread', () => {
  it('clears the seen stamp only on the person’s own thread', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 } as never);
    await expect(markThreadUnread(51592, '171')).resolves.toBe(true);
    expect(String(mockQuery.mock.calls[0][0])).toContain(
      'SET seen_at = NULL WHERE id = $1 AND user_id = $2',
    );

    mockQuery.mockResolvedValueOnce({ rowCount: 0 } as never);
    await expect(markThreadUnread(1, '171')).resolves.toBe(false);
  });

  it('has its route, behind the same checks as /seen', () => {
    const routes = readFileSync(join(__dirname, '../../api/routes/threads.routes.ts'), 'utf8');
    expect(routes).toContain("'/:id/unread'");
    expect(routes).toContain('emitThreadUpdated(userId, { id: threadId, seen_at: null })');
  });
});
