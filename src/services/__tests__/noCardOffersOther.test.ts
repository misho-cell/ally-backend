import { readFileSync } from 'fs';
import { join } from 'path';
import { ChoiceMeaning, withoutOtherOption } from '../askChoices';
import { withoutOtherChoice } from '../otherChoice';

/** #6345, RULE D584 (Giorgi, 19 Oct): no card carries „სხვა, მე დავწერ". */
describe('#6345 D584: no card offers „other, I will write it"', () => {
  it('adds none to the owner’s buttons', () => {
    expect(withoutOtherChoice(['კი', 'არა'])).toEqual(['კი', 'არა']);
    expect(withoutOtherChoice(['ვადასტურებ', 'შევცვალოთ'])).toEqual(['ვადასტურებ', 'შევცვალოთ']);
  });

  it('takes off an „other" the model wrote, in any language', () => {
    expect(withoutOtherChoice(['კი, გააგრძელე', 'არა, ჯერ არა', 'სხვა, მე დავწერ'])).toEqual([
      'კი, გააგრძელე',
      'არა, ჯერ არა',
    ]);
    expect(withoutOtherChoice(['Yes', "Other, I'll write it"])).toEqual(['Yes']);
    expect(withoutOtherChoice(['სხვა ვარიანტი'])).toEqual([]);
  });

  it('keeps no buttons as no buttons', () => {
    expect(withoutOtherChoice(null)).toBeNull();
    expect(withoutOtherChoice([])).toEqual([]);
  });

  it('adds none to a helper’s question, and takes the model’s off', () => {
    const asked = [
      { label: 'ვიცნობ, დავაკავშირებ', means: ChoiceMeaning.Yes },
      { label: 'არ ვიცნობ', means: ChoiceMeaning.No },
      { label: 'სხვა პასუხი', means: ChoiceMeaning.Answer },
    ];
    expect(withoutOtherOption(asked).map((choice) => choice.label)).toEqual([
      'ვიცნობ, დავაკავშირებ',
      'არ ვიცნობ',
    ]);
  });

  it('is applied where the owner’s buttons are stored and a question’s are built', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(chat).toContain('const storedChoices = withoutOtherChoice(');
    expect(asks).toContain('const choices = withoutOtherOption(');
  });
});
