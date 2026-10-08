jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { GoalWaitReason } from '../goalWaitReason';
import { questionsTheReplyLeftOut } from '../inboxQuestions';
import { renderPendingMessage } from '../pendingMessages';
import { goalsAwaitingTheOwner } from '../taskStore.service';

/**
 * 3367 (QA-047, NO-005; seats 180150 and 180153, 8 Oct). „რა მელოდება?"
 * listed the incoming questions and none of the owner's own goals waiting on
 * them: two plans waiting for a yes, and a plumber goal whose results were in.
 * „რა არის ახალი?" found two incoming questions and answered „ახალი არაფერია."
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('which own goals wait on the owner', () => {
  it('reads goals with a question, plans waiting for a yes, and idle goals with results', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await goalsAwaitingTheOwner('180150');

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('o.pending_question_at IS NOT NULL');
    expect(sql).toContain('o.plan IS NULL AND o.plan_proposed IS NOT NULL');
    expect(sql).toContain("l.role = 'assistant'");
    expect(params).toEqual([
      '180150',
      2,
      7,
      10,
      GoalWaitReason.Question,
      GoalWaitReason.PlanApproval,
      GoalWaitReason.NextStep,
    ]);
  });

  it('does not call a goal idle while something it sent is still out', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await goalsAwaitingTheOwner('180153');

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("a.task_id = o.id AND a.status = 'sent'");
    expect(sql).toContain('ha.released_at IS NULL');
    expect(sql).toContain("ir.status = 'pending'");
    expect(sql).toContain('LIMIT $4');
  });

  it('passes on what the database returns', async () => {
    const row = {
      task_id: 21884,
      title: 'ფოტოგრაფი მჭირდება ბათუმში',
      question: null,
      waiting_since: '2026-10-08T12:20:07.000Z',
      waiting_for: GoalWaitReason.PlanApproval,
    };
    mockQuery.mockResolvedValue({ rows: [row], rowCount: 1 } as never);

    expect(await goalsAwaitingTheOwner('180150')).toEqual([row]);
  });
});

describe('the card says why each goal waits', () => {
  const card = (language: 'ka' | 'en'): string | undefined =>
    renderPendingMessage(
      {
        kind: 'my_goals_waiting',
        task_id: null,
        payload: {
          goals: [
            { goal: 'ფოტოგრაფი ბათუმში', question: null, waiting_for: 'plan_approval' },
            { goal: 'სანტექნიკოსი', question: null, waiting_for: 'next_step' },
            { goal: 'ბუღალტერი', question: 'რა ბიუჯეტი გაქვს?', waiting_for: 'question' },
            { goal: 'ძველი', question: null },
          ],
        },
      },
      language,
    )?.text;

  it('in Georgian', () => {
    expect(card('ka')).toBe(
      [
        '4 შენი მიზანი შენს პასუხს ელოდება:',
        '• ფოტოგრაფი ბათუმში — გეგმა შენს თანხმობას ელოდება',
        '• სანტექნიკოსი — შედეგები გაქვს, შემდეგ ნაბიჯს შენ წყვეტ',
        '• ბუღალტერი — რა ბიუჯეტი გაქვს?',
        '• ძველი',
      ].join('\n'),
    );
  });

  it('in English', () => {
    expect(card('en')).toContain('• ფოტოგრაფი ბათუმში — the plan is waiting for your OK');
    expect(card('en')).toContain('• სანტექნიკოსი — the results are in; the next step is yours');
  });
});

describe('incoming questions the reply left out', () => {
  const asks = [
    { from: 'ბახვა გამოგონილი', question: 'იცნობ კარგ ავტომექანიკოსს?' },
    { from: 'თამთა გამოგონილი', question: 'იცნობ კარგ სტომატოლოგს?' },
  ];

  it('are both left out of „ახალი არაფერია."', () => {
    expect(questionsTheReplyLeftOut(asks, 'ახალი არაფერია.')).toEqual(asks);
  });

  it('none are left out when the reply names them, in any case form', () => {
    const reply = 'ბახვამ გკითხა ავტომექანიკოსზე, თამთას კი სტომატოლოგი აინტერესებს.';
    expect(questionsTheReplyLeftOut(asks, reply)).toEqual([]);
  });

  it('only the one not named is left out', () => {
    expect(questionsTheReplyLeftOut(asks, 'ბახვა გამოგონილი გეკითხება.')).toEqual([asks[1]]);
  });

  it('become a card the server writes, with who asks', () => {
    const out = renderPendingMessage(
      { kind: 'questions_waiting', task_id: null, payload: { questions: asks } },
      'ka',
    );
    expect(out?.text).toBe(
      [
        '2 კითხვა შენს პასუხს ელოდება, თითო თავის თემაში:',
        '• ბახვა გამოგონილი: იცნობ კარგ ავტომექანიკოსს?',
        '• თამთა გამოგონილი: იცნობ კარგ სტომატოლოგს?',
      ].join('\n'),
    );
    expect(out?.choices).toEqual([]);
  });

  it('no card when there is nothing to list', () => {
    expect(
      renderPendingMessage({ kind: 'questions_waiting', task_id: null, payload: {} }, 'ka'),
    ).toBeNull();
  });

  it('the inbox notes its questions and the delivery adds the ones left out', () => {
    const handler = chat.slice(
      chat.indexOf("case 'check_my_inbox': {"),
      chat.indexOf("case 'get_pending_updates': {"),
    );
    expect(handler).toContain('noteInboxQuestions(');
    const take = chat.slice(chat.indexOf('function takePendingItems('));
    expect(take.slice(0, 2500)).toContain('questionsTheReplyLeftOut(');
    expect(take.slice(0, 2500)).toContain('kind: QUESTIONS_WAITING_KIND');
  });
});
