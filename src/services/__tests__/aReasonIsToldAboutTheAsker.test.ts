const mockCreate = jest.fn();
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: (...args: unknown[]) => mockCreate(...args) } },
}));
jest.mock('../costLedger.service', () => ({ __esModule: true, recordClaudeUsage: async () => {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { reasonAboutAsker } from '../askEditor.service';

/**
 * D711, the tester's 44194 and 44200: „რაზეა საქმე: თანამშრომლობაზე მინდა
 * დაველაპარაკო" went to the go-between and the target in the owner's first
 * person. It is told about the asker before it is stored.
 */
const OWN_WORDS = 'თანამშრომლობაზე მინდა დაველაპარაკო';
const TOLD = 'ლიკას თანამშრომლობაზე სურს საუბარი.';

function answers(text: string): void {
  mockCreate.mockResolvedValue({ content: [{ type: 'text', text }], usage: {} });
}

beforeEach(() => mockCreate.mockReset());

describe('the reason for an introduction', () => {
  it('is told about the asker, in the third person', async () => {
    answers(TOLD);
    await expect(reasonAboutAsker(OWN_WORDS, 'ლიკა')).resolves.toBe(TOLD);
    const [params] = mockCreate.mock.calls[0];
    expect(params.system).toContain('about ლიკა in the third person');
    expect(params.system).toContain('SAME language');
    // The tester's 44204: „მინდა გავიცნო, თუ დათო იცნობს" kept its first person and the reader's name.
    expect(params.system).toContain('„მინდა გავიცნო" → „ლიკა-ს სურს გაიცნოს"');
    expect(params.system).toContain('never address or name either');
  });

  it('keeps the owner’s words when the rewrite is empty, far longer, or the check fails', async () => {
    answers('');
    await expect(reasonAboutAsker(OWN_WORDS, 'ლიკა')).resolves.toBe(OWN_WORDS);
    answers('ა'.repeat(600));
    await expect(reasonAboutAsker(OWN_WORDS, 'ლიკა')).resolves.toBe(OWN_WORDS);
    mockCreate.mockRejectedValue(new Error('timeout'));
    await expect(reasonAboutAsker(OWN_WORDS, 'ლიკა')).resolves.toBe(OWN_WORDS);
  });

  it('is stored that way, so every reader gets it', () => {
    const src = readFileSync(join(__dirname, '..', 'tools', 'requestIntroduction.ts'), 'utf8');
    expect(src).toContain(
      'const reason = message ? await reasonAboutAsker(message, requesterName) : null;',
    );
    expect(src).toContain('    message: reason,');
  });
});
