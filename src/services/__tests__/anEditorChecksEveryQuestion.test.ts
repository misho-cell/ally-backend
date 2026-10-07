const mockCreate = jest.fn();
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: (...args: unknown[]) => mockCreate(...args) } },
}));
jest.mock('../costLedger.service', () => ({ __esModule: true, recordClaudeUsage: async () => {} }));

import { AskDraft, editOutgoingAsk } from '../askEditor.service';
import { ChoiceMeaning } from '../askChoices';

/**
 * D711 (the founder, 7 Oct): every question to another person is checked on
 * the server before it leaves; a failing one is rewritten once and the
 * rewritten one is sent — never held. A broken check sends it as written.
 */
const DRAFT: AskDraft = {
  question: 'მეყავს ნაცნობი გია, CFO-ა. იცნობ? გამაცნობ?',
  choices: [
    { label: 'კი, ვიცნობ', means: ChoiceMeaning.Yes },
    { label: 'არა', means: ChoiceMeaning.No },
  ],
};
const CONTEXT = {
  ownerWords: ['ჰკითხე ნოდარს, იცნობს თუ არა გიას'],
  askerName: 'Lika',
  readerName: 'Nodar',
  language: 'ka' as const,
};

function answers(text: string): void {
  mockCreate.mockResolvedValue({ content: [{ type: 'text', text }], usage: {} });
}

const REWRITE = {
  ok: false,
  question: 'ლიკა ეძებს გიას, რომელიც CFO-ა. იცნობ და გააცნობ?',
  choices: [
    { label: 'კი, გავაცნობ', means: 'yes' },
    { label: 'არ ვიცნობ', means: 'no' },
    { label: 'მოგვიანებით', means: 'later' },
  ],
};

beforeEach(() => mockCreate.mockReset());

describe('the editor check', () => {
  it('sends the draft as it is when the check passes', async () => {
    answers('{"ok": true}');
    await expect(editOutgoingAsk(DRAFT, CONTEXT)).resolves.toEqual({ ...DRAFT, edited: false });
  });

  it('sends the rewritten question and buttons when it does not', async () => {
    answers(JSON.stringify(REWRITE));
    const out = await editOutgoingAsk(DRAFT, CONTEXT);
    expect(out.edited).toBe(true);
    expect(out.question).toBe(REWRITE.question);
    expect(out.choices).toHaveLength(3);
  });

  it('reads the owner’s words and the draft, on the strong model', async () => {
    answers('{"ok": true}');
    await editOutgoingAsk(DRAFT, CONTEXT);
    const [params, options] = mockCreate.mock.calls[0];
    expect(params.model).toBe('claude-sonnet-5');
    expect(params.messages[0].content).toContain('ჰკითხე ნოდარს');
    expect(params.messages[0].content).toContain('მეყავს ნაცნობი გია');
    expect(options.timeout).toBeLessThanOrEqual(8_000);
  });

  // The tester's REGRESSION 44196: the reader was put in the third person by name.
  it('speaks to the reader as „you", about the asker by name, and leaves a passing question alone', async () => {
    answers('{"ok": true}');
    await editOutgoingAsk(DRAFT, CONTEXT);
    const [params] = mockCreate.mock.calls[0];
    expect(params.system).toContain('It speaks TO Nodar as „you"');
    expect(params.system).toContain('never names Nodar');
    expect(params.system).toContain('What Lika needs or wants is told ABOUT Lika, by name');
    // The tester's run 2 (44203): „მჭირდება / მირჩიო / მასესხო / დამეხმაროს" passed.
    for (const form of [
      '„მჭირდება"',
      '„მირჩიე / მირჩიო"',
      '„მასესხო"',
      '„დამეხმარე / დამეხმაროს"',
    ]) {
      expect(params.system).toContain(form);
    }
    expect(params.system).toContain('When every rule holds, do not improve it');
    expect(params.system).toContain('never merely whether the reader can contact that person');
  });

  it.each([
    ['one button alone', { ...REWRITE, choices: REWRITE.choices.slice(0, 1) }],
    ['two questions', { ...REWRITE, question: 'იცნობ გიას? გააცნობ?' }],
    ['an empty question', { ...REWRITE, question: '' }],
    ['a rewrite that grew far past the draft', { ...REWRITE, question: 'ა'.repeat(500) }],
  ])('keeps the draft when the rewrite has %s', async (_why, verdict) => {
    answers(JSON.stringify(verdict));
    await expect(editOutgoingAsk(DRAFT, CONTEXT)).resolves.toEqual({ ...DRAFT, edited: false });
  });

  it('never holds a question back when the check itself breaks', async () => {
    mockCreate.mockRejectedValue(new Error('timeout'));
    await expect(editOutgoingAsk(DRAFT, CONTEXT)).resolves.toEqual({ ...DRAFT, edited: false });
    answers('I think it is fine.');
    await expect(editOutgoingAsk(DRAFT, CONTEXT)).resolves.toEqual({ ...DRAFT, edited: false });
  });
});

describe('the ask path', () => {
  const { readFileSync } = jest.requireActual<typeof import('fs')>('fs');
  const { join } = jest.requireActual<typeof import('path')>('path');
  const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

  it('checks every question before it is saved for the reader', () => {
    const edit = asks.indexOf('const edited = await editOutgoingAsk(');
    expect(edit).toBeGreaterThan(-1);
    expect(asks.indexOf('const opening = buildAskOpening(', edit)).toBeGreaterThan(edit);
  });

  it('keeps what the reader was shown, and the buttons it came with', () => {
    expect(asks).toContain('JSON.stringify(choices),\n      edited.question,');
  });
});
