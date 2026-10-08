import { readFileSync } from 'fs';
import { join } from 'path';
import { namesACondition, withoutConditionStated } from '../healthDisclosure';

/**
 * 3567 (SA-013, 2 of 2): the helper read „…მეგობარი ლაშა გამოგონილი მძიმე
 * დეპრესიაშია, იცნობ თუ არა კარგ ფსიქოლოგს?" — the need goes out, the condition never.
 */
describe('a question carries the need, never somebody’s condition (3567)', () => {
  it('the tester’s question loses the friend and his illness', () => {
    const out = withoutConditionStated(
      'ოუნერ ც19-ს მეგობარი ლაშა გამოგონილი მძიმე დეპრესიაშია, იცნობ თუ არა კარგ ფსიქოლოგს?',
    );
    expect(out).toBe('იცნობ თუ არა კარგ ფსიქოლოგს?');
    expect(out).not.toContain('ლაშა');
    expect(out).not.toContain('დეპრესი');
  });

  it.each([
    [
      'Do you know a good psychologist? My friend Lasha is badly depressed.',
      'Do you know a good psychologist?',
    ],
    ['У моего друга депрессия, ты знаешь хорошего психолога?', 'Ты знаешь хорошего психолога?'],
    ['Mi amigo tiene cáncer; ¿conoces a un buen oncólogo?', '¿conoces a un buen oncólogo?'],
  ])('„%s"', (question, expected) => {
    expect(withoutConditionStated(question)).toBe(expected);
  });

  it('a question whose need IS the condition goes out whole', () => {
    const q = 'Do you know a good doctor for diabetes?';
    expect(withoutConditionStated(q)).toBe(q);
  });

  it('a question naming no condition is left exactly as it is', () => {
    const q = 'იცნობ თუ არა კარგ ნოტარიუსს თბილისში?';
    expect(withoutConditionStated(q)).toBe(q);
  });

  it('nothing but a stated condition leaves nothing', () => {
    expect(withoutConditionStated('ლაშა მძიმე დეპრესიაშია.')).toBeNull();
  });

  it.each(['ფსიქოლოგი', 'psychologist', 'психолог', 'Ракитин', 'Kibo Café', 'aidsheet'])(
    'an ordinary word „%s" is no condition',
    (word) => {
      expect(namesACondition(word)).toBe(false);
    },
  );

  it('every ask passes the filter after the editor, so its title does too', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    const filtered = asks.indexOf('questionWithoutCondition(editorsAsk.question)');
    expect(filtered).toBeGreaterThan(-1);
    expect(asks.indexOf('openAskThread(toUserId, senderName, edited.question')).toBeGreaterThan(
      filtered,
    );
  });
});
