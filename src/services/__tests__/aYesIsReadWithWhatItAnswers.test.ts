const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));
const mockCreate = jest.fn();
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: (...a: unknown[]) => mockCreate(...a) } },
}));
const mockUsage = jest.fn();
jest.mock('../costLedger.service', () => ({
  recordClaudeUsage: (...a: unknown[]) => mockUsage(...a),
}));

import {
  consentFromAnswer,
  IntroConsent,
  readIntroConsent,
  recentExchange,
  RECENT_MESSAGES_TO_READ,
} from '../introConsentReader';

const origin = { userId: '7', runId: 'r1', threadId: 61001 };
const answered = (word: string): unknown => ({
  content: [{ type: 'text', text: word }],
  usage: { input_tokens: 1, output_tokens: 1 },
});

beforeEach(() => {
  jest.resetAllMocks();
  mockUsage.mockResolvedValue(undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

/**
 * Misho, 13 Nov (a real member): „კი" to „shall I write to Erekle with this
 * text?" was refused because the yes carried no name. No set phrase: the yes is
 * read with the messages before it, up to ten, and an unclear one is asked about.
 */
describe('the conversation a yes is read with', () => {
  it('is the last ten messages, oldest first, the server’s own notes left out', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { role: 'user', content: 'კი' },
        { role: 'user', content: '(სისტემური შენიშვნა: …)' },
        { role: 'assistant', content: 'ვთხოვ ერეკლეს, გაგაცნოს ნინო ბერიძე. მივწერო?' },
      ],
    });

    const exchange = await recentExchange(61001);

    expect(exchange).toEqual([
      'ASSISTANT: ვთხოვ ერეკლეს, გაგაცნოს ნინო ბერიძე. მივწერო?',
      'OWNER: კი',
    ]);
    expect(mockQuery.mock.calls[0]?.[1]).toEqual([61001, RECENT_MESSAGES_TO_READ]);
  });

  it('is empty when the conversation cannot be read', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));
    expect(await recentExchange(61001)).toEqual([]);
  });
});

describe('the owner’s consent, as the small model reads it', () => {
  const exchange = ['ASSISTANT: ვთხოვ ერეკლეს, გაგაცნოს ნინო ბერიძე. მივწერო?', 'OWNER: კი'];

  it('is yes when it says yes', async () => {
    mockCreate.mockResolvedValue(answered('yes'));
    expect(await readIntroConsent(exchange, 'Erekle', 'Nino Beridze', origin)).toBe(
      IntroConsent.Yes,
    );
  });

  it('is no when it says no', async () => {
    mockCreate.mockResolvedValue(answered('No.'));
    expect(await readIntroConsent(exchange, 'Erekle', 'Nino Beridze', origin)).toBe(
      IntroConsent.No,
    );
  });

  it('is unclear on any other answer, a failure, or no conversation — never a silent send', async () => {
    mockCreate.mockResolvedValue(answered('maybe'));
    expect(await readIntroConsent(exchange, 'Erekle', 'Nino Beridze', origin)).toBe(
      IntroConsent.Unclear,
    );
    mockCreate.mockRejectedValue(new Error('timeout'));
    expect(await readIntroConsent(exchange, 'Erekle', 'Nino Beridze', origin)).toBe(
      IntroConsent.Unclear,
    );
    expect(await readIntroConsent([], 'Erekle', 'Nino Beridze', origin)).toBe(IntroConsent.Unclear);
  });

  it('reads one word, punctuation and case aside', () => {
    expect(consentFromAnswer(' Yes. ')).toBe(IntroConsent.Yes);
    expect(consentFromAnswer('yes, he agreed')).toBe(IntroConsent.Unclear);
  });
});
