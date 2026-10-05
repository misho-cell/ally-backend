import { readFileSync } from 'fs';
import { join } from 'path';
import { sentenceCarriedOver } from '../sentenceCarriedOver';
import { ownersLineQuoted } from '../factKeeping';
import { factsAdded, firstPersonCarried } from '../helpersVoice';
import { missingFacts } from '../answerFacts';

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

  it('is found with a word left out (1156, 38776: „მე" dropped)', () => {
    const helper = 'მე 51-ე საჯარო სკოლაში ვასწავლი ინგლისურს, ვაკეში, 2015 წლიდან.';
    expect(
      sentenceCarriedOver(helper, '51-ე საჯარო სკოლაში ვასწავლი ინგლისურს, ვაკეში, 2015 წლიდან.'),
    ).toBe(helper);
    expect(
      sentenceCarriedOver(
        helper,
        'ცირამ მომწერა: 51-ე საჯარო სკოლაში ვასწავლი ინგლისურს, 2015 წლიდან.',
      ),
    ).toBe(helper);
  });

  it('is not found in a real rewording that keeps the facts', () => {
    const helper = 'მე 51-ე საჯარო სკოლაში ვასწავლი ინგლისურს, ვაკეში, 2015 წლიდან.';
    expect(
      sentenceCarriedOver(
        helper,
        'ცირა 51-ე საჯარო სკოლაში ასწავლის ინგლისურს, ვაკეში, 2015 წლიდან.',
      ),
    ).toBeNull();
    const owner = 'ორშაბათს 10 საათზე იმავე მისამართზე შეგვიძლია?';
    expect(
      sentenceCarriedOver(
        owner,
        'შეგვიძლია ორშაბათს, 12 ოქტომბერს, 10 საათზე შევხვდეთ იმავე მისამართზე?',
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
      'if (sentenceCarriedOver(own, answerText) !== null) return HELPERS_SENTENCE_REFUSAL;',
    );
  });

  it('is held back for added facts, then once for the first person', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain('if (added.length > 0) return factsAddedRefusal(added);');
    expect(asks).toContain(
      'return firstPersonHeldBack(askThreadId, firstPersonCarried(own, question, answerText));',
    );
  });
});

/** D648, the tester's 1156: the helper's voice and facts she did not send (38777). */
describe('the helper’s voice', () => {
  const helper = 'ათი წელია ვასწავლი ინგლისურ ენას, 2015 წლიდან, 51-ე საჯარო სკოლაში.';
  const question = 'რამდენი წელია ასწავლი და რომელ საგანს ასწავლი?';
  const card =
    'ინგლისურ ენას ვასწავლი, 2015 წლიდან, ანუ ათი წელია უკვე. ვასწავლი 51-ე საჯარო სკოლაში, ვაკეში.';

  it('is found in a first-person verb carried over', () => {
    expect(firstPersonCarried(helper, question, card)).toEqual(['ვასწავლი']);
    expect(
      firstPersonCarried(
        helper,
        question,
        'ცირა ათი წელია, 2015 წლიდან, ასწავლის ინგლისურს 51-ე საჯარო სკოლაში.',
      ),
    ).toEqual([]);
  });

  it('is not a „ვ" word the question shares, a „ვერ" or a name', () => {
    expect(
      firstPersonCarried(
        'ვეტერინარს ვერ გირჩევ, ვახტანგს ჰკითხე.',
        'კარგ ვეტერინარს იცნობ?',
        'ვეტერინარს ვერ გირჩევს, ვახტანგს ჰკითხეთ.',
      ),
    ).toEqual([]);
  });

  it('finds a place she did not write, and allows one from the question', () => {
    expect(factsAdded(helper, question, card)).toEqual(['ვაკეში']);
    expect(factsAdded('კი, 51-ე სკოლაში.', 'ვაკეში ასწავლი?', 'კი, ვაკეში, 51-ე სკოლაში.')).toEqual(
      [],
    );
  });

  it('finds a number or a link she did not write', () => {
    expect(factsAdded('ორშაბათს შემიძლია.', 'როდის?', 'ორშაბათს 10 საათზე შეძლებს.')).toEqual([
      '10',
    ]);
    expect(factsAdded('კი.', 'საიტი აქვს?', 'კი, https://a.ge')).toEqual(['https://a.ge']);
  });

  it('keeps a place she wrote as a fact the answer must carry', () => {
    expect(missingFacts('ვაკეში ვცხოვრობ.', 'ცხოვრობს თბილისში.')).toEqual(['ვაკეში']);
    expect(missingFacts('ვაკეში ვცხოვრობ.', 'ვაკეში ცხოვრობს.')).toEqual([]);
  });
});
