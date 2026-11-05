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
  ])(
    'a reply that names nobody („%s") keeps its words; the server’s sentence follows (#8779 c)',
    (reply) => {
      expect(planReplyText(reply, INTRODUCTION, 'ka')).toBe(`${reply}\n\n${SERVER}\n\nდავიწყო?`);
    },
  );

  it('keeps run 1’s own clean sentence, which names whom it introduces', () => {
    const own =
      'ლიკა მეხუთის ასისტენტს დაველაპარაკები და შევეცდები, ლიკამ გაგაცნოთ ნინუცა მეხუთესთან.';
    expect(planReplyText(`${own}\n\nდავიწყო?`, INTRODUCTION, 'ka')).toBe(`${own}\n\nდავიწყო?`);
  });

  it('a plan that writes to nobody adds no sentence under the news (#8779 c)', () => {
    const other = {
      text: 'ჯერ ვეძებ, ვინ შეძლებს ამაში დახმარებას, და ჯერ არავის ვწერ.',
      names: [],
    };
    expect(planReplyText('სამი ნოტარიუსი ვიპოვე.', other, 'ka')).toBe(
      'სამი ნოტარიუსი ვიპოვე.\n\nდავიწყო?',
    );
  });
});

describe('a short clean plan sentence', () => {
  it('stays even when the reply is under the length that counts as carrying the plan', () => {
    const own = 'ლიკა მეხუთის ასისტენტს დაველაპარაკები, რომ ნინუცა გაგაცნოს.';
    expect(planReplyText(own, INTRODUCTION, 'ka')).toBe(`${own}\n\nდავიწყო?`);
  });
});
