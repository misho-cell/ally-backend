import { readFileSync } from 'fs';
import { join } from 'path';

import { ChoiceMeaning, withServerOther } from '../askChoices';
import { otherChoiceIndex, otherChoiceLabel } from '../otherChoice';
import { askThreadTitle } from '../taskAsks.service';

/**
 * 1688 (Lika's phone, 15 Oct): „Lika Ose-ს კარგი ფოტოგრაფი სჭირდება, იცნობ თუ
 * არა ასეთს?" arrived with three buttons and no „other" — the one set of
 * buttons without it.
 */
const THREE = [
  { label: 'კი, ვიცნობ', means: ChoiceMeaning.Yes },
  { label: 'არა, არ ვიცნობ', means: ChoiceMeaning.No },
  { label: 'მოგვიანებით გიპასუხებ', means: ChoiceMeaning.Later },
];

describe('the buttons under an incoming question', () => {
  it('end with „other, I’ll write it" in the reader’s language', () => {
    const choices = withServerOther(THREE, 'ka');
    expect(choices).toHaveLength(THREE.length + 1);
    expect(choices[choices.length - 1]).toEqual({
      label: otherChoiceLabel('ka'),
      means: ChoiceMeaning.Answer,
    });
  });

  it('so the app opens the box at that button', () => {
    const labels = withServerOther(THREE, 'en').map((choice) => choice.label);
    expect(otherChoiceIndex(labels)).toBe(THREE.length);
  });

  it('get no second „other", and a question with no buttons gets none', () => {
    const once = withServerOther(THREE, 'ka');
    expect(withServerOther(once, 'ka')).toEqual(once);
    expect(withServerOther([], 'ka')).toEqual([]);
  });

  it('are given it where the ask is written', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toMatch(/const choices = withServerOther\(\s+withPeopleDetails\(/);
  });
});

describe('the title of an incoming question’s thread', () => {
  it('does not say the asker’s name twice when the question opens with it', () => {
    expect(askThreadTitle('Lika Ose', 'Lika Ose-ს კარგი ფოტოგრაფი სჭირდება')).toBe(
      'Lika Ose-ს კარგი ფოტოგრაფი სჭირდება',
    );
  });

  it('puts the name in front when the question does not open with it', () => {
    expect(askThreadTitle('Lika Ose', 'კარგ ფოტოგრაფს იცნობ?')).toBe(
      'Lika Ose: კარგ ფოტოგრაფს იცნობ?',
    );
  });

  it('is the question alone when there is no name', () => {
    expect(askThreadTitle('  ', 'კარგ ფოტოგრაფს იცნობ?')).toBe('კარგ ფოტოგრაფს იცნობ?');
  });
});
