import { readFileSync } from 'fs';
import { join } from 'path';
import { foreignLetterRefusal, labelWithForeignLetter } from '../buttonLetters';

/**
 * #367 — Ninia's test 8, thread 30140: the button „დიაႮ, გაეგზავნო თორნიკესთვის".
 * The model wrote an old-script capital inside „დიახ".
 */
describe('a button label', () => {
  it('with an old-script letter is caught, and the letter named', () => {
    expect(labelWithForeignLetter(['დიაႮ, გაეგზავნო თორნიკესთვის', 'არა, ეხლა ვეცდი'])).toEqual({
      label: 'დიაႮ, გაეგზავნო თორნიკესთვის',
      letter: 'Ⴎ',
    });
  });

  it('with an Armenian letter that looks close enough to pass is caught', () => {
    expect(labelWithForeignLetter(['დիახ'])?.letter).toBe('ի');
  });

  it('in ordinary Georgian, English, Russian, digits or emoji passes', () => {
    expect(
      labelWithForeignLetter([
        'ვამტკიცებ',
        'შევცვალოთ',
        'Approve',
        'Изменить',
        '50 ლარი',
        '💙 Ketevan',
      ]),
    ).toBeNull();
  });

  it('is sent back to the model with the label and the letter in the refusal', () => {
    const said = foreignLetterRefusal({ label: 'დიაႮ', letter: 'Ⴎ' });
    expect(said).toContain('„დიაႮ"');
    expect(said).toContain('„Ⴎ"');
    expect(said).toContain('Call present_choices again');
  });

  it('never reaches the screen when refused: the capture keeps only a clean set', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('labelWithForeignLetter(labelsAsWritten) === null');
    expect(chat).toContain('{ presented: false, error: foreignLetterRefusal(foreign) }');
  });
});
