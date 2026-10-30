const create = jest.fn();
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create } },
}));
jest.mock('../costLedger.service', () => ({ __esModule: true, recordClaudeUsage: async () => {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { relayedForReader } from '../askTranslation.service';

/**
 * #8154 (tester, v19 round, 4/10; Misho, 30 Oct: yes on the recommendation):
 * the answers card put the helper's own first-person words after „მითხრა, რომ
 * …" — „გეტყვით", the plural — because a Georgian answer to a Georgian owner
 * was never retold, only translated, and that was skipped. The helper's own
 * words are now retold: third person singular, in the owner's language.
 */
const HELPERS_WORDS = 'კი, ვიცნობ კარგ მზარეულს, ხვალ გეტყვით მის ნომერს.';
const RETOLD = 'ნინო კარგ მზარეულს იცნობს და ხვალ მის ნომერს გეტყვის.';

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({ content: [{ type: 'text', text: RETOLD }], usage: {} });
});

describe('the helper’s own words on the card', () => {
  it('are retold even when the helper and the owner write the same language', async () => {
    const relayed = await relayedForReader(HELPERS_WORDS, 'ka', 'retold_answer');
    expect(relayed.text).toBe(RETOLD);
    const system = String(create.mock.calls[0][0].system);
    expect(system).toContain('Retell the message in Georgian');
    expect(system).toContain('third person');
    expect(system).toContain('never in the plural or formal „you“');
  });

  it('are still only translated across languages for anything else, and skipped within one', async () => {
    const same = await relayedForReader(HELPERS_WORDS, 'ka', 'answer');
    expect(same.skipped).toBe('same_language');
    expect(create).not.toHaveBeenCalled();
  });

  it('are retold on the card only when they are the helper’s own words', () => {
    const card = readFileSync(join(__dirname, '..', 'answerCard.service.ts'), 'utf8');
    expect(card).toContain("return answer.verbatim ? 'retold_answer' : 'answer';");
    expect(
      card.match(/relayedForReader\(answer\.answer, [^,]+, relayKind\(answer\)\)/g),
    ).toHaveLength(2);
  });
});
