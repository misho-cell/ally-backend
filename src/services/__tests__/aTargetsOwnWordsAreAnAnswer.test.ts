const create = jest.fn();
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: (...args: unknown[]) => create(...args) } },
}));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordClaudeUsage: jest.fn().mockResolvedValue(undefined),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { TargetAnswer } from '../targetConsent';
import { readTargetAnswer, targetAnswerFromModel } from '../targetAnswerReader';

/**
 * The tester's battery (6 Nov, C4): „კი, სიამოვნებით გავიცნობ" matched no
 * button and no listed phrase, so nothing was recorded. A small model reads it.
 */
const ORIGIN = { userId: '7', threadId: 9 };
const answered = (text: string): { content: { type: string; text: string }[]; usage: object } => ({
  content: [{ type: 'text', text }],
  usage: { input_tokens: 1, output_tokens: 1 },
});

describe('the target’s answer in their own words', () => {
  beforeEach(() => create.mockReset());

  it('is read by its meaning', async () => {
    create.mockResolvedValue(answered('{"answer": "yes"}'));
    expect(await readTargetAnswer('კი, სიამოვნებით გავიცნობ', ORIGIN)).toBe(TargetAnswer.Yes);
    create.mockResolvedValue(answered('{"answer": "no"}'));
    expect(await readTargetAnswer('ახლა ვერა, მერე', ORIGIN)).toBe(TargetAnswer.No);
  });

  it('decides nothing when unclear, empty, or when the model fails', async () => {
    create.mockResolvedValue(answered('{"answer": "unclear"}'));
    expect(await readTargetAnswer('ვინ არის ეს?', ORIGIN)).toBeNull();
    expect(await readTargetAnswer('  ', ORIGIN)).toBeNull();
    create.mockRejectedValue(new Error('timeout'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await readTargetAnswer('კი', ORIGIN)).toBeNull();
  });

  it('reads only the two answers it knows', () => {
    expect(targetAnswerFromModel('Here: {"answer":"YES"}')).toBe(TargetAnswer.Yes);
    expect(targetAnswerFromModel('{"answer":"maybe"}')).toBeNull();
    expect(targetAnswerFromModel('no json')).toBeNull();
  });
});

describe('the server', () => {
  const src = readFileSync(join(__dirname, '..', 'introduction.service.ts'), 'utf8');
  const fn = src.slice(
    src.indexOf('async function targetAnswerIn('),
    src.indexOf('export async function settleTargetAnswer('),
  );

  it('asks the small model only while a target question is open, after the buttons', () => {
    expect(fn.indexOf('targetAnswerOf(line)')).toBeLessThan(fn.indexOf('targetQuestionIsOpen('));
    expect(fn.indexOf('targetQuestionIsOpen(')).toBeLessThan(fn.indexOf('readTargetAnswer('));
    expect(src).toContain('const answer = await targetAnswerIn(targetUserId, threadId, line);');
  });
});
