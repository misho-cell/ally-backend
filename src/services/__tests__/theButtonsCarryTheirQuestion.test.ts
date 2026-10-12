import { readFileSync } from 'fs';
import { join } from 'path';
import { lastStepQuestion, withQuestionFromSteps } from '../questionWithButtons';

/**
 * 2971 (conv 44420): the profile question went only into a step bubble and the
 * kept message was „ვუცდი შენს პასუხს." under five buttons.
 */
const STEP = 'ვნახე შენი პროფილი. რომელი ტიპის გაცნობა არ გავაკეთო შენთვის?';
const FINAL = 'ვუცდი შენს პასუხს.';

describe('a message with buttons carries its question', () => {
  it('takes the question the run said only in a step', () => {
    expect(withQuestionFromSteps(FINAL, [STEP])).toBe(
      'რომელი ტიპის გაცნობა არ გავაკეთო შენთვის?\n\nვუცდი შენს პასუხს.',
    );
  });

  it('leaves a message that already asks', () => {
    const asks = 'რომელი ტიპის გაცნობა არ გავაკეთო შენთვის?';
    expect(withQuestionFromSteps(asks, [STEP])).toBe(asks);
  });

  it('uses the newest step that asked, and leaves the message alone when none did', () => {
    expect(lastStepQuestion(['პირველი?', 'მეორე ნაბიჯი.', 'ბოლო კითხვა?'])).toBe('ბოლო კითხვა?');
    expect(withQuestionFromSteps(FINAL, ['ვეძებ.', 'ვნახე.'])).toBe(FINAL);
  });

  it('is applied only to the model’s buttons, before the server’s own lines', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const at = chat.indexOf('finalText = withQuestionFromSteps(finalText, stepTexts);');
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(chat.indexOf('// 2608: a fact saved in this run'));
    expect(at).toBeLessThan(chat.indexOf('// 3302: „deleted" is said only when'));
  });
});
