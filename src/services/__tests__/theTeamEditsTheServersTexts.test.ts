jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import {
  forgetServerTexts,
  loadServerTexts,
  ServerTextBlock,
  serverText,
} from '../serverTextBlocks';
import { PLAN_CLOSING_QUESTION, planInSentences, TaskPlan } from '../taskPlans.service';
import { WORLD_ANSWER_BRIEF, worldQuestionPrompt } from '../worldAnswer';

/**
 * The founder, 30 Oct (79102, „the prompt is mine"): the answers card's
 * retelling brief and the plan's closing line were held in code. Each is now a
 * prompt block the team edits; until one is written, the code's text stands.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const rows = (r: unknown[]): never => ({ rows: r, rowCount: r.length }) as never;

beforeEach(() => {
  forgetServerTexts();
  mockQuery.mockReset();
});

describe('a server text the team can edit', () => {
  it('is the code’s own until a block is written', async () => {
    mockQuery.mockResolvedValue(rows([]));
    await loadServerTexts();
    expect(serverText(ServerTextBlock.PlanClosingQuestionKa, 'დავიწყო?')).toBe('დავიწყო?');
  });

  it('is the block once the team has written one, read by its name only', async () => {
    mockQuery.mockResolvedValue(rows([{ content: '  ვკითხო?  ' }]));
    await loadServerTexts();
    expect(serverText(ServerTextBlock.PlanClosingQuestionKa, 'დავიწყო?')).toBe('ვკითხო?');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('WHERE name = $1 AND enabled = TRUE');
    expect(params).toEqual([expect.any(String)]);
  });

  it('keeps the code’s text when the block is empty or the read fails', async () => {
    mockQuery.mockResolvedValue(rows([{ content: '   ' }]));
    await loadServerTexts();
    expect(serverText(ServerTextBlock.CardRetellBrief, 'code brief')).toBe('code brief');
    forgetServerTexts();
    mockQuery.mockRejectedValue(new Error('timeout'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await loadServerTexts();
    expect(serverText(ServerTextBlock.CardRetellBrief, 'code brief')).toBe('code brief');
  });
});

describe('the plan the owner reads', () => {
  const PLAN: TaskPlan = {
    solved_when: 'x',
    routes: [],
    people_to_involve: [{ name: 'ნიკა', phone: '1', route: 'r', reach: 'ok' }],
    never_contact: [],
  };

  it('fills the team’s sentence with the names and the right „assistant" form', async () => {
    mockQuery.mockResolvedValue(rows([{ content: '{names} {assistants} ვკითხავ.' }]));
    await loadServerTexts();
    expect(planInSentences(PLAN, 'ka')).toContain('ასისტენტს ვკითხავ.');
    expect(PLAN_CLOSING_QUESTION.ka).toBe('{names} {assistants} ვკითხავ.');
  });
});

describe('the first answer’s brief (tester 79221)', () => {
  it('is the code’s text until the team writes the block, then the block, in the member’s language', async () => {
    mockQuery.mockResolvedValue(rows([]));
    await loadServerTexts();
    expect(worldQuestionPrompt('Q?', 'ka')).toContain(
      WORLD_ANSWER_BRIEF.split('{language}').join('Georgian'),
    );
    forgetServerTexts();
    mockQuery.mockResolvedValue(
      rows([{ content: 'Answer in {language}. Only dates on the page.' }]),
    );
    await loadServerTexts();
    const prompt = worldQuestionPrompt('Q?', 'en');
    expect(prompt).toContain('Answer in English. Only dates on the page.');
    // The format the server reads back stays in code.
    expect(prompt).toContain('PEOPLE:');
    expect(prompt.endsWith('Question: Q?')).toBe(true);
  });
});
