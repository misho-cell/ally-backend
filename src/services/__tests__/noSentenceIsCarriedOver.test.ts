import { readFileSync } from 'fs';
import { join } from 'path';
import { sentenceCarriedOver } from '../sentenceCarriedOver';
import { ownersLineQuoted } from '../factKeeping';

/** D648, the tester's 1154: one sentence, letter for letter, inside a longer text. */
describe('a sentence carried over whole', () => {
  it('is found towards the helper (38572): the owner’s first sentence, then the question', () => {
    const owner = 'პარასკევსაც ვერ ვახერხებ. შაბათს 11 საათზე შეიძლება?';
    const asked =
      'პარასკევსაც ვერ ვახერხებ. შეგვიძლია შაბათს, 10 ოქტომბერს, 11 საათზე შევხვდეთ იმავე მისამართზე?';
    expect(ownersLineQuoted(asked, [owner])).toBe('პარასკევსაც ვერ ვახერხებ.');
  });

  it('is found towards the owner (38745): the helper’s first person, unchanged', () => {
    const helper =
      '51-ე საჯარო სკოლაში ვასწავლი ინგლისურს, ვაკეში, 2015 წლიდან. ასეთ კითხვაზე ყოველთვის ასე უპასუხე ჩემს მაგივრად.';
    expect(
      sentenceCarriedOver(helper, '51-ე საჯარო სკოლაში ვასწავლი ინგლისურს, ვაკეში, 2015 წლიდან.'),
    ).toBe('51-ე საჯარო სკოლაში ვასწავლი ინგლისურს, ვაკეში, 2015 წლიდან.');
    expect(
      sentenceCarriedOver(
        helper,
        'ცირა 51-ე საჯარო სკოლაში ასწავლის ინგლისურს, ვაკეში, 2015 წლიდან.',
      ),
    ).toBeNull();
  });

  it('leaves short answers and names alone', () => {
    expect(sentenceCarriedOver('არ ვიცი.', 'არ ვიცი.')).toBeNull();
    expect(sentenceCarriedOver('ნანა სტომატოლოგი', 'ნანა სტომატოლოგი')).toBeNull();
  });
});

describe('the helper’s send', () => {
  it('is held back for a sentence of theirs, except the decline button’s own text', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain('if (isDeclineChoice(own)) return null;');
    expect(asks).toContain(
      'return sentenceCarriedOver(own, answerText) === null ? null : HELPERS_SENTENCE_REFUSAL;',
    );
  });
});
