const mockCreate = jest.fn();
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: (...args: unknown[]) => mockCreate(...args) } },
}));
jest.mock('../costLedger.service', () => ({
  recordClaudeUsage: jest.fn().mockResolvedValue(undefined),
}));

import { readReplyClaims } from '../replyClaims.service';

/**
 * Lika's case 01 (12 Nov, B03): The target asked „ვინაა გიორგი?". The reply said
 * who he is and closed on an offer — „ან პირდაპირ გადავცე, რომ … თანახმა
 * ხარ?" (or shall I pass on that you agree?). The claims reader counted the
 * offer as „passed on", the server asked for the reply again, and the answer
 * about Giorgi was replaced by „nothing has been sent yet". A question or an
 * offer claims nothing.
 */
describe('the claims reader', () => {
  beforeEach(() => mockCreate.mockReset());

  it('is told that a question or an offer makes no claim', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '{"owner":[],"claims":{}}' }] });
    await readReplyClaims('გინდა, გადავცე?', 'ვინაა გიორგი?', { userId: '1' });
    const system = String((mockCreate.mock.calls[0] as [{ system: string }])[0].system);
    expect(system).toContain('neither does a question or an offer');
    expect(system).toContain('shall I pass it on?');
  });
});
