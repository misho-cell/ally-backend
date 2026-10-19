jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../askTranslation.service', () => ({
  relayedForReader: jest.fn((text: string) => Promise.resolve({ text })),
}));
const mockSave = jest.fn((_thread: number, _owner: number, content: string) =>
  Promise.resolve({ id: 9, content }),
);
jest.mock('../threads.service', () => ({
  __esModule: true,
  saveServerLine: (thread: number, owner: number, content: string) =>
    mockSave(thread, owner, content),
  threadLanguage: jest.fn(() => Promise.resolve('ka')),
}));
jest.mock('../sse.service', () => ({ __esModule: true, emitMessageAppended: jest.fn() }));

import { AskTap, askTapLineForAsker, buttonToldByNetai, yesIsToldAtTheTap } from '../askOpening';
import { buildAnswerCard, showAnswersToOwner } from '../answerCard.service';
import { query } from '../../db/postgres/client';

const QUOTE_MARKS = /[„"“”«»]/u;

/**
 * #6007 (FULL BATTERY 19 Oct, D647/D648): a tapped answer reached the owner in
 * the helper's exact words — „გიგა: „ვიცნობ, გავაცნობ"" (QA-001), „ნიკა: „კი,
 * თავისუფალი ვარ"" (QA-003), „…ასისტენტი: ამაში ვერ დაგეხმარები" (QA-006).
 */
describe('#6007: a tapped button is retold in Netai’s words', () => {
  it('says nothing at the tap of a model-written „yes": the card tells it (68824, QA-003)', () => {
    for (const label of ['ვიცნობ, გავაცნობ', 'კი, თავისუფალი ვარ']) {
      expect(askTapLineForAsker(AskTap.Yes, 'ka', 'ნიკა', label)).toBeNull();
      expect(yesIsToldAtTheTap(label)).toBe(false);
    }
  });

  it('keeps the general sentence when no label is known', () => {
    const line = askTapLineForAsker(AskTap.Yes, 'ka', 'ნიკა');
    expect(line).toBe('ნიკა ამბობს, რომ დაგეხმარება — დეტალებს მალე მოგწერს.');
    expect(line).not.toMatch(QUOTE_MARKS);
  });

  it('retells our own „yes" buttons in the third person', () => {
    expect(askTapLineForAsker(AskTap.Yes, 'ka', 'გიგა', 'კი, გაგაცნობ')).toBe(
      'გიგა მზადაა, გაგაცნოს.',
    );
    expect(askTapLineForAsker(AskTap.Yes, 'ka', 'გიგა', 'კი, ვიცნობ')).toBe(
      'გიგა ამბობს, რომ შესაფერის ადამიანს იცნობს.',
    );
    expect(askTapLineForAsker(AskTap.Yes, 'en', 'Giga', "Yes, I'll introduce you")).toBe(
      'Giga is ready to introduce you.',
    );
  });

  it('reads a button tapped in another language', () => {
    expect(buttonToldByNetai('ამაში ვერ დაგეხმარები', 'en', 'Sandro')).toBe(
      "Sandro can't help with this one.",
    );
  });

  it('leaves other words alone', () => {
    expect(buttonToldByNetai('ხვალ დაგირეკავ', 'ka', 'სანდრო')).toBeNull();
  });

  it('leaves „later" as it was', () => {
    expect(askTapLineForAsker(AskTap.Later, 'ka', 'ზურა', 'მოგვიანებით')).toBe(
      'ზურა მოგვიანებით გიპასუხებს.',
    );
  });

  it('puts a tapped refusal on the card as Netai’s sentence (QA-006)', async () => {
    const card = await buildAnswerCard(
      [{ askId: 1, answer: 'ამაში ვერ დაგეხმარები', fromName: 'სანდრო', verbatim: false }],
      'ka',
    );
    expect(card).toContain('სანდრო ამაში ვერ დაგეხმარება.');
    expect(card).not.toContain('დაგეხმარები');
  });

  it('lets a model-written „yes" answer onto the card; ours stays an echo of the tap', async () => {
    const mocked = query as jest.MockedFunction<typeof query>;
    mocked.mockReset();
    mocked.mockResolvedValueOnce({
      rows: [
        { id: 1, choices: [{ label: 'კი, თავისუფალი ვარ', means: 'yes' }] },
        { id: 2, choices: null },
      ],
    } as never);
    mocked.mockResolvedValue({ rows: [{ id: 9, content: 'card' }] } as never);
    await showAnswersToOwner({ threadId: 5, ownerId: 7 }, [
      { askId: 1, answer: 'ხვალ საღამოს თავისუფალია.', fromName: 'ნიკა', verbatim: false },
      { askId: 2, answer: 'დაგეხმარება.', fromName: 'გიგა', verbatim: false },
    ]);
    expect(mockSave).toHaveBeenCalledTimes(1);
    const card = String(mockSave.mock.calls[0][2]);
    expect(card).toContain('ხვალ საღამოს თავისუფალია');
    expect(card).not.toContain('დაგეხმარება.');
  });
});
