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

  it('with a Georgian-block code point that is no letter at all is caught (1133, 36599)', () => {
    expect(labelWithForeignLetter(['ვამტკი჊ებ'])?.letter).toBe('჊');
    expect(labelWithForeignLetter(['ვამტ�იცებ'])?.letter).toBe('�');
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

describe('digits or Latin letters glued into a Georgian word (#1486, 45310)', () => {
  it('catches the garbled label from conv 43544', () => {
    expect(labelWithForeignLetter(['სხვა გკ96ა მოვახოთ', 'დავხუროთ ეს საქმე'])).toEqual({
      label: 'სხვა გკ96ა მოვახოთ',
      letter: '9',
    });
    expect(labelWithForeignLetter(['ვამტკიცeბ'])).toEqual({ label: 'ვამტკიცeბ', letter: 'e' });
  });

  it('lets numbers and names with a hyphenated ending, and plain Latin labels, through', () => {
    expect(
      labelWithForeignLetter([
        '10-ში შევხვდეთ',
        'Netai-ზე მოვიწვიოთ',
        'Yes, send it',
        'CFO გია',
        '2 ადამიანი',
      ]),
    ).toBeNull();
  });
});
