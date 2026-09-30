jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));

import { query } from '../../db/postgres/client';
import {
  answerIsTheirOwnWords,
  buildAnswerWakeEvent,
  buildRelayAnswerWakeEvent,
  ensureVerbatimQuote,
} from '../taskAsks.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function theyTyped(...lines: string[]): void {
  mockQuery.mockResolvedValueOnce({
    rows: lines.map((content) => ({ content })),
    rowCount: lines.length,
  } as never);
}

/**
 * Row 303, the seat's round of 29 September. Test 44 typed one sentence; his
 * assistant sent another; the owner saw the second in quotation marks under
 * Test 44's name.
 */
const TYPED = 'კი, ბახვა გამოგონილი კარგი ბუღალტერია, ჩემი კონტაქტია. დავაკავშირებ, თუ გინდა.';
const REWORDED = 'კი, ვიცნობ სანდო ბუღალტერს, ბახვა. დაგაკავშირებთ.';

describe('only the words a person typed are quoted as theirs', () => {
  beforeEach(() => mockQuery.mockReset());

  it('recognises their own words, ignoring case and punctuation', async () => {
    theyTyped(TYPED);
    expect(
      await answerIsTheirOwnWords(26676, 'კი ბახვა გამოგონილი კარგი ბუღალტერია ჩემი კონტაქტია'),
    ).toBe(true);
  });

  it("does not take their assistant's rewording for their words (the seat's case)", async () => {
    theyTyped(TYPED);
    expect(await answerIsTheirOwnWords(26676, REWORDED)).toBe(false);
  });

  it('claims nothing it cannot check', async () => {
    expect(await answerIsTheirOwnWords(null, REWORDED)).toBe(false);
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    expect(await answerIsTheirOwnWords(26676, REWORDED)).toBe(false);
  });

  it('reads with a limit and a timeout, parameterized', async () => {
    theyTyped();
    await answerIsTheirOwnWords(26676, REWORDED);
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/LIMIT \$2/);
    expect(params).toEqual([26676, 20]);
    expect(timeout).toBeGreaterThan(0);
  });
});

describe('the event and the guarantee follow that answer', () => {
  it('keeps the quote instruction for their own words', () => {
    expect(buildAnswerWakeEvent(TYPED, 'Netai Test 44', true)).toMatch(/სიტყვასიტყვით, ციტატად/);
  });

  it('asks for the meaning, without quotation marks, for a rewording', () => {
    for (const event of [
      buildAnswerWakeEvent(REWORDED, 'Netai Test 44', false),
      buildRelayAnswerWakeEvent(REWORDED, 'Netai Test 44', 'Netai Test 45', false),
    ]) {
      expect(event).not.toMatch(/სიტყვასიტყვით, ციტატად/);
      expect(event).toMatch(/ზუსტი სიტყვები არ არის/);
      expect(event).toMatch(/ბრჭყალების გარეშე/);
    }
  });

  it('does not wrap a rewording in quotes when the reply left it out', () => {
    const out = ensureVerbatimQuote('ბუღალტერი ნაპოვნია.', {
      text: REWORDED,
      who: 'Netai Test 44',
      verbatim: false,
    });
    expect(out).not.toContain('„');
    expect(out.startsWith('Netai Test 44: ')).toBe(true);
  });

  it('leaves a reply alone that already names who answered', () => {
    const reply = 'Netai Test 44-მა მითხრა, რომ ბახვას იცნობს და დაგაკავშირებს.';
    expect(
      ensureVerbatimQuote(reply, { text: REWORDED, who: 'Netai Test 44', verbatim: false }),
    ).toBe(reply);
  });

  it('still quotes their own words exactly as before', () => {
    expect(ensureVerbatimQuote('ok', { text: TYPED, who: 'Netai Test 44', verbatim: true })).toBe(
      `„${TYPED}" — Netai Test 44\n\nok`,
    );
  });
});
