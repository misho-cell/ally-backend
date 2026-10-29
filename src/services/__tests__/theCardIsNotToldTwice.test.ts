jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { withoutCardRepeat } from '../answerCardGuard';

/**
 * #8154 (tester, v19 round, 29 Oct: two messages 7/7): the server's card told
 * the owner what the helper said, and the run's reply told it again before its
 * question. The repeat comes off; the question stays.
 */
const CARD =
  'გიორგი, ვესაუბრე ლიკას ასისტენტს და მითხრა, რომ ქართველ ფეხბურთელებს არ იცნობს, ' +
  'მაგრამ შეუძლია კალათბურთელი შემოგთავაზოს.';

describe('a reply under an answers card', () => {
  it('drops the sentence that retells the card and keeps the next step', () => {
    const reply =
      'ლიკას ასისტენტმა მითხრა, რომ ქართველ ფეხბურთელებს არ იცნობს, მაგრამ კალათბურთელს შემოგთავაზებს. ' +
      'გინდა, კალათბურთელზე ვკითხო?';
    expect(withoutCardRepeat(reply, CARD)).toBe('გინდა, კალათბურთელზე ვკითხო?');
  });

  it('leaves a reply that only takes the next step alone', () => {
    expect(withoutCardRepeat('გინდა, სხვას ვკითხო?', CARD)).toBeNull();
    expect(
      withoutCardRepeat('მადლობა ლიკას. ახლა ნინოს ვკითხავ, იცნობს თუ არა მწვრთნელს.', CARD),
    ).toBeNull();
  });

  it('keeps the last sentence when the whole reply was the card again', () => {
    const reply =
      'ლიკას ასისტენტმა მითხრა, რომ ქართველ ფეხბურთელებს არ იცნობს. მაგრამ კალათბურთელს შემოგთავაზებს.';
    expect(withoutCardRepeat(reply, CARD)).toBe('მაგრამ კალათბურთელს შემოგთავაზებს.');
  });

  it('runs only on an answer-card run, after the finish-card guard', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const guard = chat.indexOf('withoutCardRepeat(cleanedFinal, card)');
    expect(guard).toBeGreaterThan(chat.indexOf('withoutEarlySolvedCard(cleanedFinal'));
    expect(chat.slice(guard - 300, guard)).toContain('isAnswerCardEvent(userMessage)');
  });
});
