jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../askTranslation.service', () => ({
  relayedForReader: jest.fn((text: string) => Promise.resolve({ text })),
}));

import { AskTap, askTapLineForAsker, buttonToldByNetai } from '../askOpening';
import { buildAnswerCard } from '../answerCard.service';

const QUOTE_MARKS = /[„"“”«»]/u;

/**
 * #6007 (FULL BATTERY 19 Oct, D647/D648): a tapped answer reached the owner in
 * the helper's exact words — „გიგა: „ვიცნობ, გავაცნობ"" (QA-001), „ნიკა: „კი,
 * თავისუფალი ვარ"" (QA-003), „…ასისტენტი: ამაში ვერ დაგეხმარები" (QA-006).
 */
describe('#6007: a tapped button is retold in Netai’s words', () => {
  it('tells a model-written „yes" without quoting it (QA-001, QA-003)', () => {
    for (const label of ['ვიცნობ, გავაცნობ', 'კი, თავისუფალი ვარ']) {
      const line = askTapLineForAsker(AskTap.Yes, 'ka', 'ნიკა', label);
      expect(line).toBe('ნიკა ამბობს, რომ დაგეხმარება — დეტალებს მალე მოგწერს.');
      expect(line).not.toMatch(QUOTE_MARKS);
    }
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
});
