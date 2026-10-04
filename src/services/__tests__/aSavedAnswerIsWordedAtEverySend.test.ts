const mockCreate = jest.fn();
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: (...args: unknown[]) => mockCreate(...args) } },
}));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordClaudeUsage: jest.fn().mockResolvedValue(undefined),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { ruleAnswerInOwnWords } from '../ruleAnswerWording.service';

/**
 * D652 (the founder, box 37654): a saved automatic answer is worded afresh at
 * every send by a small model, and the D648 facts check applies to that wording.
 */
const SAVED = 'ნანა ბერიძე, სტომატოლოგი, 50 ლარი';
const QUESTION = 'სტომატოლოგს იცნობ?';

function replies(text: string): void {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text }],
    usage: { input_tokens: 10, output_tokens: 10 },
  });
}

beforeEach(() => jest.clearAllMocks());

describe('a saved answer at send', () => {
  it('goes in the assistant’s words when every fact is kept', async () => {
    replies('გირჩევს სტომატოლოგ ნანა ბერიძეს, ვიზიტი 50 ლარი ღირს.');
    await expect(ruleAnswerInOwnWords(SAVED, QUESTION, 'ka', '501')).resolves.toBe(
      'გირჩევს სტომატოლოგ ნანა ბერიძეს, ვიზიტი 50 ლარი ღირს.',
    );
    const [request] = mockCreate.mock.calls[0] as [{ system: string }];
    expect(request.system).toContain('Not a quotation and no quotation marks');
    expect(request.system).toContain('in Georgian');
  });

  it('goes as saved when the wording lost a fact', async () => {
    replies('გირჩევს სტომატოლოგ ნანას.');
    await expect(ruleAnswerInOwnWords(SAVED, QUESTION, 'ka', '501')).resolves.toBe(SAVED);
  });

  it('goes as saved when the model cannot be reached or says nothing', async () => {
    mockCreate.mockRejectedValueOnce(new Error('timeout'));
    await expect(ruleAnswerInOwnWords(SAVED, QUESTION, 'ka', '501')).resolves.toBe(SAVED);
    replies('');
    await expect(ruleAnswerInOwnWords(SAVED, QUESTION, 'ka', '501')).resolves.toBe(SAVED);
  });

  it('is what the automatic answer records, delivers and shows the helper', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain('const captured = await recordAskAnswer(askThreadId, answerText);');
    expect(asks).toContain('answeredByYourRule(ruleLanguage, rule.kind, answerText)');
  });
});
