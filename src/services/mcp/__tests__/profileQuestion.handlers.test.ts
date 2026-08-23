jest.mock('../../partH.service', () => ({
  __esModule: true,
  getNextQuestion: jest.fn(),
  recordAnswer: jest.fn(),
}));

import { getNextQuestion, recordAnswer } from '../../partH.service';
import { mcpGetProfileQuestion, mcpAnswerProfileQuestion } from '../handlers';

const mockGetNextQuestion = getNextQuestion as jest.MockedFunction<typeof getNextQuestion>;
const mockRecordAnswer = recordAnswer as jest.MockedFunction<typeof recordAnswer>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('mcpGetProfileQuestion (ticket 6 task 3)', () => {
  it('passes the requested moment straight through', async () => {
    mockGetNextQuestion.mockResolvedValue({ found: false });

    await mcpGetProfileQuestion('7', { moment: 'message_draft', language: 'en' });

    expect(mockGetNextQuestion).toHaveBeenCalledWith('7', 'message_draft', 'en');
  });

  it("remaps 'onboarding' to 'any' — those 7 rows are sign-up only, not chat", async () => {
    mockGetNextQuestion.mockResolvedValue({ found: false });

    await mcpGetProfileQuestion('7', { moment: 'onboarding' });

    expect(mockGetNextQuestion).toHaveBeenCalledWith('7', 'any', 'ka');
  });

  it('defaults moment to any and language to ka when omitted', async () => {
    mockGetNextQuestion.mockResolvedValue({ found: false });

    await mcpGetProfileQuestion('7', {});

    expect(mockGetNextQuestion).toHaveBeenCalledWith('7', 'any', 'ka');
  });
});

describe('mcpAnswerProfileQuestion (ticket 6 task 3)', () => {
  it('refuses a call with no question_id rather than reaching the DB', async () => {
    const out = await mcpAnswerProfileQuestion('7', { question_id: '' });

    expect(out).toEqual({ recorded: false, error: 'Pass question_id.' });
    expect(mockRecordAnswer).not.toHaveBeenCalled();
  });

  it('forwards option_ids, free_text and skipped to recordAnswer', async () => {
    mockRecordAnswer.mockResolvedValue({ recorded: true, dimensions_moved: ['goal_clarity'] });

    const out = await mcpAnswerProfileQuestion('7', {
      question_id: 'q1',
      option_ids: ['a', 'b'],
      free_text: 'ჩემი ვარიანტი',
      skipped: false,
    });

    expect(mockRecordAnswer).toHaveBeenCalledWith('7', {
      questionId: 'q1',
      optionIds: ['a', 'b'],
      freeText: 'ჩემი ვარიანტი',
      skipped: false,
    });
    expect(out).toEqual({ recorded: true, dimensions_moved: ['goal_clarity'] });
  });
});
