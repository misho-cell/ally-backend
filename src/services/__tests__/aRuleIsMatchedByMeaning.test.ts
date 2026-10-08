const mockCreate = jest.fn();
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: (...args: unknown[]) => mockCreate(...args) } },
}));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordClaudeUsage: jest.fn().mockResolvedValue(undefined),
}));
const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => mockQuery(...args),
}));

import { chosenRuleIndex, ruleCoveringByMeaning } from '../ruleMatchByMeaning.service';
import { matchAnswerRule, ruleThatWouldAnswer } from '../answerRules.service';

/**
 * The tester's 1158: an English rule met a reworded English ask and a Georgian
 * one and matched neither by words. Misho's word (5 Oct): judge by meaning when
 * the words do not match; none when in doubt or on any failure.
 */
const TUTOR = {
  id: 7,
  user_id: 172729,
  kind: 'Requests for a good English tutor for a child in Tbilisi',
  sample_question: 'Do you know a good English tutor for a schoolgirl in Tbilisi?',
  answer: 'Nino Beridze, 40 GEL an hour.',
  active: true,
  uses: 0,
  last_used_at: null,
  created_at: '2026-09-30T00:00:00Z',
};
const GEORGIAN_ASK = 'იცნობ კარგ ინგლისურის რეპეტიტორს ბავშვისთვის თბილისში?';

function replies(text: string): void {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text }],
    usage: { input_tokens: 10, output_tokens: 1 },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [TUTOR] });
});

describe('the model’s reply', () => {
  it('names a rule by its number, or nothing', () => {
    expect(chosenRuleIndex('1', 2)).toBe(0);
    expect(chosenRuleIndex(' 2. ', 2)).toBe(1);
    expect(chosenRuleIndex('none', 2)).toBeNull();
    expect(chosenRuleIndex('3', 2)).toBeNull();
    expect(chosenRuleIndex('0', 2)).toBeNull();
    expect(chosenRuleIndex('rule 1 maybe', 2)).toBeNull();
  });
});

describe('a rule matched by meaning', () => {
  it('fires for a Georgian ask of the rule’s kind', async () => {
    replies('1');
    await expect(ruleCoveringByMeaning(GEORGIAN_ASK, [TUTOR], '172729')).resolves.toBe(TUTOR);
    const [request] = mockCreate.mock.calls[0] as [
      { system: string; messages: { content: string }[] },
    ];
    expect(request.system).toContain('When unsure');
    // Ninia's 11518: a catch-all never widens a rule to another profession.
    expect(request.system).toContain('does not widen');
    expect(request.system).toContain("same profession or service as the rule's example question");
    expect(request.messages[0].content).toContain(TUTOR.kind);
    expect(request.messages[0].content).toContain(GEORGIAN_ASK);
  });

  it('does not fire on none, on an unreadable reply or when the model fails', async () => {
    replies('none');
    await expect(ruleCoveringByMeaning('Do you know a plumber?', [TUTOR], '1')).resolves.toBeNull();
    replies('I think 1');
    await expect(ruleCoveringByMeaning(GEORGIAN_ASK, [TUTOR], '1')).resolves.toBeNull();
    mockCreate.mockRejectedValueOnce(new Error('timeout'));
    await expect(ruleCoveringByMeaning(GEORGIAN_ASK, [TUTOR], '1')).resolves.toBeNull();
  });

  it('is not asked when there is no rule', async () => {
    await expect(ruleCoveringByMeaning(GEORGIAN_ASK, [], '1')).resolves.toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('ruleThatWouldAnswer', () => {
  it('keeps the word match first and asks no model when it holds', async () => {
    await expect(
      ruleThatWouldAnswer(172729, 'Do you know a good English tutor for a schoolgirl in Tbilisi?'),
    ).resolves.toEqual(TUTOR);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('falls back to the meaning when the words do not match', async () => {
    replies('1');
    await expect(ruleThatWouldAnswer(172729, GEORGIAN_ASK)).resolves.toEqual(TUTOR);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('asks no model for a recipient without rules', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(ruleThatWouldAnswer(5, GEORGIAN_ASK)).resolves.toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('automatic answers are switched off (D669)', () => {
  it('no question is answered from a rule while the switch is off', async () => {
    await expect(matchAnswerRule(172729, GEORGIAN_ASK)).resolves.toBeNull();
  });
});
