import { readFileSync } from 'fs';
import { join } from 'path';
import { withoutMatchJustification } from '../planJustification';

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
    expect(chat).toContain('withClosingQuestion(withoutMatchJustification(reply), runLang(runId))');
  });
});
