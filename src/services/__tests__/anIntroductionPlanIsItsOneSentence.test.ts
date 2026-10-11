import { planReplyText } from '../chat.service';

/**
 * 1454 (box 53461, conv 50065 and 50067, on 0167): the model's reply was only
 * „დამელოდე, სანამ დაადასტურებ." — no plan — and the server put its plan
 * sentence after it, so the owner read the stray line first. An introduction
 * plan is its one sentence and one question (D739) on every path.
 */
const SERVER = 'ლიკა მეხუთის ასისტენტს დაველაპარაკები და შევეცდები, ეს მოვაგვარო.';
const INTRODUCTION = { text: SERVER, names: ['ლიკა მეხუთე'] };

describe('an introduction plan is its one sentence and one question', () => {
  it.each([
    'დამელოდე, სანამ დაადასტურებ.',
    'დაელოდე ჩემს კითხვას და დამიდასტურე, როცა მზად იქნები.',
  ])('a reply without the plan („%s") gives way to the server’s sentence', (reply) => {
    expect(planReplyText(reply, INTRODUCTION, 'ka')).toBe(`${SERVER}\n\nდავიწყო?`);
  });

  it('keeps run 1’s own clean sentence, which names whom it introduces', () => {
    const own =
      'ლიკა მეხუთის ასისტენტს დაველაპარაკები და შევეცდები, ლიკამ გაგაცნოთ ნინუცა მეხუთესთან.';
    expect(planReplyText(`${own}\n\nდავიწყო?`, INTRODUCTION, 'ka')).toBe(`${own}\n\nდავიწყო?`);
  });

  it('leaves a plan without the plan sentence as before: the news leads (the tester’s 1110)', () => {
    const other = {
      text: 'ჯერ ვეძებ, ვინ შეძლებს ამაში დახმარებას, და ჯერ არავის ვწერ.',
      names: [],
    };
    expect(planReplyText('სამი ნოტარიუსი ვიპოვე.', other, 'ka')).toBe(
      `სამი ნოტარიუსი ვიპოვე.\n\n${other.text}\n\nდავიწყო?`,
    );
  });
});

describe('a short clean plan sentence', () => {
  it('stays even when the reply is under the length that counts as carrying the plan', () => {
    const own = 'ლიკა მეხუთის ასისტენტს დაველაპარაკები, რომ ნინუცა გაგაცნოს.';
    expect(planReplyText(own, INTRODUCTION, 'ka')).toBe(`${own}\n\nდავიწყო?`);
  });
});
