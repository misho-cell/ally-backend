const create = jest.fn();
jest.mock('../../config/openai', () => ({
  __esModule: true,
  openaiClient: () => ({ chat: { completions: { create } } }),
}));
jest.mock('../finalAnswer.service', () => ({
  __esModule: true,
  finalAnswerModel: () => 'a-model',
  toLedgerUsage: () => ({}),
}));
jest.mock('../costLedger.service', () => ({ __esModule: true, recordClaudeUsage: async () => {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { questionForReader } from '../askTranslation.service';

/**
 * ROW 254 — THE FRAME WAS BUILT IN THE READER'S LANGUAGE AND THE QUESTION
 * INSIDE IT WAS NOT.
 *
 * The night seat found it in their own stops: „Netai Test 3-ის ასისტენტი
 * გეკითხება: "Do you know a reliable electrician…"" — a Georgian frame around
 * an English question, because the asker wrote in English. There was no
 * translation step anywhere in the ask path and NO COMMENT SAYING THERE SHOULD
 * NOT BE, which in this codebase means nobody decided it rather than somebody
 * deciding against it. One path over, `goalQuestions.service` already tells the
 * model to „translate if the conversation is in another language".
 *
 * The founder's vision settles it without a new ruling: „the assistant conveys
 * its meaning to the other assistant, which speaks to its own user in a
 * suitable tone. Meaning, conditions and agreements must be preserved
 * accurately."
 *
 * THE CONTROL IS FIRST AND IT IS PART OF THE DONE-WHEN, agreed with the seat at
 * 01:43 rather than checked afterwards. Most asks here are Georgian to
 * Georgian. A version that pays for a model call on those fails on price
 * however good its translations are.
 */
beforeEach(() => {
  jest.clearAllMocks();
  create.mockResolvedValue({ choices: [{ message: { content: 'თარგმანი' } }], usage: {} });
});

describe('the same-language case spends nothing — the control', () => {
  it.each([
    ['ka', 'იცნობ კარგ ელექტრიკოსს?'],
    ['en', 'Do you know a reliable electrician?'],
  ])('%s to %s asks no model at all', async (language, question) => {
    const out = await questionForReader(question, language as 'ka' | 'en');

    expect(out.text).toBe(question);
    expect(out.skipped).toBe('same_language');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('a question in another language is translated for its reader', () => {
  it('puts the translation in front and keeps the original, labelled', async () => {
    const out = await questionForReader('Do you know a reliable electrician?', 'ka');

    expect(out.text.startsWith('თარგმანი')).toBe(true);
    expect(out.text).toContain('ორიგინალი');
    expect(out.text).toContain('Do you know a reliable electrician?');
    expect(out.original).toBe('Do you know a reliable electrician?');
  });

  /**
   * THE LABEL IS IN THE READER'S LANGUAGE TOO. „(original: …)" in English above
   * a Georgian translation is the same fault one layer down.
   */
  it.each([
    ['en', 'оригинал', 'original'],
    ['ru', 'original', 'оригинал'],
  ])('labels it in %s', async (language, absent, present) => {
    create.mockResolvedValue({ choices: [{ message: { content: 'translated' } }], usage: {} });

    const out = await questionForReader('იცნობ კარგ ელექტრიკოსს?', language as 'en' | 'ru');

    expect(out.text).toContain(present);
    expect(out.text).not.toContain(absent);
  });

  /** Meaning exact, tone free — the vision's own division, in the brief. */
  it('asks for the meaning to be kept and the tone to be human', async () => {
    await questionForReader('Do you know an electrician?', 'ka');

    const brief = String(create.mock.calls[0][0].messages[0].content);
    expect(brief).toContain('Georgian');
    expect(brief).toContain('EXACTLY');
    expect(brief).toMatch(/Names, numbers, dates and places stay as they are/);
  });
});

describe('and it never loses the question', () => {
  /**
   * EVERY FAILURE RETURNS THE ASKER'S OWN WORDS, which is exactly today's
   * behaviour — so the worst this change can do is what already happens. That
   * is the whole reason it was safe to put in front of a real message.
   */
  it('sends the original when the model throws', async () => {
    create.mockRejectedValue(new Error('down'));

    const out = await questionForReader('Do you know an electrician?', 'ka');

    expect(out.text).toBe('Do you know an electrician?');
    expect(out.skipped).toBe('failed');
    expect(out.original).toBeUndefined();
  });

  it('sends the original when the answer is empty', async () => {
    create.mockResolvedValue({ choices: [{ message: { content: '   ' } }], usage: {} });

    const out = await questionForReader('Do you know an electrician?', 'ka');

    expect(out.text).toBe('Do you know an electrician?');
    expect(out.skipped).toBe('failed');
  });

  /**
   * AND AN ANSWER THAT IS THE ORIGINAL IS NOT A TRANSLATION. Labelling it
   * „(original: …)" underneath itself would tell the reader something untrue
   * about what they are looking at.
   */
  it('does not dress the original up as a translation of itself', async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: 'Do you know an electrician?' } }],
      usage: {},
    });

    const out = await questionForReader('Do you know an electrician?', 'ka');

    expect(out.text).toBe('Do you know an electrician?');
    expect(out.text).not.toContain('ორიგინალი');
  });

  it('leaves something far too long alone rather than paying to translate it', async () => {
    const huge = `Do you know an electrician? ${'x'.repeat(2000)}`;

    const out = await questionForReader(huge, 'ka');

    expect(out.text).toBe(huge);
    expect(out.skipped).toBe('too_long');
    expect(create).not.toHaveBeenCalled();
  });
});

/**
 * THE WIRE. Every assertion above holds the function; this project keeps
 * finding that the piece is tested from every angle and the line that calls it
 * is not — twice today in my own work.
 */
describe('the ask path actually uses it, where the frame is chosen', () => {
  const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

  it('translates before composing, in the reader’s language', () => {
    expect(asks).toContain('const relayed = await questionForReader(safeQuestion, language);');
  });

  it('puts the relayed text in the opening rather than the raw question', () => {
    const at = asks.indexOf('const opening = buildAskOpening(');
    const call = asks.slice(at, at + 260);

    expect(call).toContain('relayed.text');
    expect(call).not.toContain('safeQuestion');
  });

  /**
   * AND THE STORED QUESTION STAYS THE ASKER'S OWN WORDS. `task_asks.question`
   * is what every later read — the answer, the chase, the admin — treats as
   * what was asked. A translation there would quietly become the record.
   */
  it('stores the asker’s own words, not the translation', () => {
    const at = asks.indexOf('INSERT INTO task_asks');
    expect(asks.slice(at, at + 700)).toContain('safeQuestion');
  });
});
