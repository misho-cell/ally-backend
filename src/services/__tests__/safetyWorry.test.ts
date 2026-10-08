import { readFileSync } from 'fs';
import { join } from 'path';
import { SafetyWorry, safetyReplyFor, safetyWorryIn } from '../safetyWorry';

/**
 * 3568 (SA-013 step 5, 2 of 2): „მეშინია, თავს რამე არ დაუშავოს." got the
 * internal-check apology. A blocked reply to a safety worry is a warm answer.
 */
describe('a safety worry never gets the internal-check apology (3568)', () => {
  it.each([
    'მეშინია, თავს რამე არ დაუშავოს.',
    'I am scared he will hurt himself.',
    'Боюсь, что он навредит себе.',
    'Tengo miedo de que se haga daño.',
  ])('„%s" is a worry about someone else', (line) => {
    expect(safetyWorryIn(line)).toBe(SafetyWorry.AboutSomeoneElse);
  });

  it.each(['სიცოცხლე აღარ მინდა', 'I want to die', 'Не хочу жить', 'no quiero vivir'])(
    '„%s" is the owner’s own crisis',
    (line) => {
      expect(safetyWorryIn(line)).toBe(SafetyWorry.AboutThemselves);
    },
  );

  it.each(['ვინ მყავს იურისტად?', 'Who do I know at the bank?', 'Find me a good psychologist'])(
    'an ordinary line „%s" is no worry',
    (line) => {
      expect(safetyWorryIn(line)).toBeNull();
      expect(safetyReplyFor(line, 'ka')).toBeNull();
    },
  );

  it('the answer says stay with them, 112, and offers to find help — in the owner’s language', () => {
    const ka = safetyReplyFor('მეშინია, თავს რამე არ დაუშავოს.', 'ka') ?? '';
    expect(ka).toContain('112');
    expect(ka).toContain('მარტო ნუ დატოვებ');
    expect(ka).toContain('ფსიქოლოგს');
    expect(ka).not.toContain('შიდა შემოწმება');
    expect(safetyReplyFor('I am scared he will hurt himself.', 'en')).toContain('112');
  });

  it('the blocked-reply path asks for it before the apology', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      '(safetyReplyFor(userMessage, language) ?? RUN_STRINGS[language].moderationBlocked)',
    );
  });
});
