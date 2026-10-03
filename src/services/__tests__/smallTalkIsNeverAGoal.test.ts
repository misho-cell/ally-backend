import { readFileSync } from 'fs';
import { join } from 'path';
import { isSmallTalk } from '../smallTalk';

/**
 * The tester's 1113 (the founder's account, 18:43–18:46Z): „გამარჯობა" and „რა
 * დღეა დღეს?" typed after „+ ახალი მიზანი" became goals 15676 and 15677.
 */
describe('small talk', () => {
  it.each([
    'გამარჯობა',
    'რა დღეა დღეს?',
    'რომელი საათია?',
    'როგორ ხარ?',
    'მადლობა!',
    'What day is it today?',
    'How are you?',
    'Thank you',
    'Как дела?',
  ])('„%s" is small talk', (line) => {
    expect(isSmallTalk(line)).toBe(true);
  });

  it.each([
    'ვინ იცნობს კარგ ვეტერინარს?',
    'მჭირდება ბუღალტერი',
    'რა დღეა დღეს? და ვინ იცნობს ნოტარიუსს?',
    'Who knows a good dentist?',
    'ფოტოგრაფი',
  ])('„%s" is not', (line) => {
    expect(isSmallTalk(line)).toBe(false);
  });

  it('opens no goal, whatever button it was typed after', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const gate = chat.indexOf('if (isSmallTalk(userMessage)) {');
    const flag = chat.indexOf('if (intent?.asGoal !== true && !looksLikeGoalRequest(userMessage))');
    expect(gate).toBeGreaterThan(-1);
    expect(flag).toBeGreaterThan(gate);
  });
});
