import { readFileSync } from 'fs';
import { join } from 'path';
import { withoutMatchJustification, withPlanSentence } from '../planJustification';

/**
 * 1454 / D739: an introduction plan is one sentence and one question; the
 * sentence explaining the match in front of it goes (run 1 of 3, 9 Oct).
 */
const PLAN =
  'ბახვა გამოგონილის ასისტენტს დაველაპარაკები და შევეცდები მოვაგვარო, რომ ბახვამ გაგაცნოთ თამთა გამოგონილი. დავიწყო?';

describe('the plan is its one sentence and one question (D739)', () => {
  it('the founder’s run 1: the match sentence before the plan goes', () => {
    const reply =
      'ბახვა გამოგონილი შენი პირდაპირი კონტაქტია და ნეტაიზე წევრია, და ის იცნობს თამთა გამოგონილს, ეს ზუსტად ემთხვევა შენს თხოვნას. ' +
      PLAN;
    expect(withoutMatchJustification(reply)).toBe(PLAN);
  });

  it('the same sentence as its own paragraph goes too', () => {
    const reply =
      'Bakhva is your direct contact and a Netai member, and he knows Tamta.\n\n' +
      'I will talk to Bakhva’s assistant and try to arrange an introduction to Tamta. Shall I start?';
    expect(withoutMatchJustification(reply)).toBe(
      'I will talk to Bakhva’s assistant and try to arrange an introduction to Tamta. Shall I start?',
    );
  });

  it('news ahead of the plan stays (the tester’s 1110)', () => {
    const reply = 'შენს კონტაქტებში სამი ნოტარიუსი ვიპოვე.\n\n' + PLAN;
    expect(withoutMatchJustification(reply)).toBe(reply);
  });

  it('a plan that is already one sentence is untouched', () => {
    expect(withoutMatchJustification(PLAN)).toBe(PLAN);
  });

  it('a reply with no plan sentence is untouched', () => {
    const reply = 'ბახვა შენი პირდაპირი კონტაქტია და იცნობს თამთას.';
    expect(withoutMatchJustification(reply)).toBe(reply);
  });

  it('the plan reply passes through it', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('withPlanSentence(withoutMatchJustification(reply), plan.text)');
  });
});

/** 1454 (the tester's 50625, owner 182501): a reply with only the justification and the question. */
describe('a plan reply without the plan sentence', () => {
  const plan = 'ბახვა გამოგონილის ასისტენტს დაველაპარაკები და შევეცდები, ეს მოვაგვარო.';
  const said =
    'ვიპოვე გზა: თამთა გამოგონილი თქვენი მეორე წრის კონტაქტია და მასთან ერთადერთი ხიდი სწორედ ბახვა ' +
    'გამოგონილია, რომელიც თქვენი პირდაპირი კონტაქტია და თავად იყენებს ნეტაის. დავიწყო?';

  it('gets the server’s plan sentence in place of the justification', () => {
    expect(withPlanSentence(said, plan)).toBe(plan);
  });

  it('keeps real news first, and leaves a reply that has its plan sentence alone', () => {
    expect(withPlanSentence(`ლევანმა უპასუხა, ბინა აქვს. ${said}`, plan)).toBe(
      `ლევანმა უპასუხა, ბინა აქვს.\n\n${plan}`,
    );
    const good = `${plan} დავიწყო?`;
    expect(withPlanSentence(good, plan)).toBe(good);
  });

  it('changes nothing when the server has no plan sentence of its own', () => {
    expect(withPlanSentence(said, 'ჯერ ვეძებ, ვინ შეძლებს ამაში დახმარებას.')).toBe(said);
  });
});
