import { withNothingFoundLast } from '../nothingFoundLast';
import { scrubFinal } from '../chat.service';

/**
 * Team task #365 (G2). Replies as stored on 2 October — the first sentence
 * said the owner's contacts held nobody, and the find came after it.
 */
const NOBODY_OWN = 'შენს პირად კონტაქტებში უძრავი ქონების ადვოკატი ან იურისტი ვერ ვიპოვე.';
const SECOND_CIRCLE =
  'მეორე წრეში, შენი კონტაქტის Netai Test 156-ის მეშვეობით, სამი ადვოკატი გამოჩნდა: დათო, ქეთი და სანდრო.';
const QUESTION = 'ამ გეგმას მივყვე და ვიმოქმედო?';

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('a reply that opens with „nothing found"', () => {
  it('opens with the second circle instead, and says the empty contacts after it', () => {
    expect(withNothingFoundLast(`${NOBODY_OWN}\n\n${SECOND_CIRCLE}`)).toBe(
      `${SECOND_CIRCLE}\n\n${NOBODY_OWN}`,
    );
  });

  it('keeps the closing question last', () => {
    expect(withNothingFoundLast(`${NOBODY_OWN}\n\n${SECOND_CIRCLE}\n\n${QUESTION}`)).toBe(
      `${SECOND_CIRCLE}\n\n${NOBODY_OWN}\n\n${QUESTION}`,
    );
  });

  it('moves it when the find follows in the same paragraph, from the web', () => {
    const web =
      'ვებიდან კი თბილისის სანტექნიკების კატალოგში სამი ოსტატი ვნახე:\n\nბექა, ვაკე\nhttps://santeqniki.ge/1';
    const opening =
      'შენს კონტაქტებსა და მათ ნაცნობებშიც ვამოწმე და სანტექნიკოსზე მითითება ვერ ვიპოვე.';
    expect(withNothingFoundLast(`${opening} ${web}`)).toBe(`${web}\n\n${opening}`);
  });

  it('works in English and Russian too', () => {
    expect(
      withNothingFoundLast('I could not find a lawyer in your contacts. I found two on the web.'),
    ).toBe('I found two on the web.\n\nI could not find a lawyer in your contacts.');
    expect(
      withNothingFoundLast('В твоих контактах никого нет. Во втором круге нашёл юриста.'),
    ).toBe('Во втором круге нашёл юриста.\n\nВ твоих контактах никого нет.');
  });
});

describe('a reply it leaves alone', () => {
  it('a reply that is only „nothing found" — that is the answer', () => {
    const only = 'ვებში 4 შედეგი შევამოწმე — შენს კონტაქტებში კავშირი ვერ ვიპოვე.';
    expect(withNothingFoundLast(only)).toBe(only);
  });

  it('a reply whose rest finds nothing either', () => {
    const none = `${NOBODY_OWN}\n\nროგორც კი ვინმე გიპასუხებს, მაშინვე გეტყვი.`;
    expect(withNothingFoundLast(none)).toBe(none);
    const alsoNone = `${NOBODY_OWN} მეორე წრეშიც არავინ გამოჩნდა.`;
    expect(withNothingFoundLast(alsoNone)).toBe(alsoNone);
  });

  it('an opening that already turns to the find', () => {
    const turned = `შენს პირად კონტაქტებში ადვოკატი ვერ ვიპოვე, მაგრამ მეორე წრეში სამი გამოჩნდა.\n\n${QUESTION}`;
    expect(withNothingFoundLast(turned)).toBe(turned);
    const russian = 'Никого не нашёл в контактах, но во втором круге нашёл юриста.';
    expect(withNothingFoundLast(russian)).toBe(russian);
  });

  it('a reply that already opens with the find', () => {
    const good = `${SECOND_CIRCLE}\n\n${NOBODY_OWN}`;
    expect(withNothingFoundLast(good)).toBe(good);
  });
});

describe('the final every reply passes through', () => {
  it('applies the check', () => {
    expect(scrubFinal(`${NOBODY_OWN}\n\n${SECOND_CIRCLE}`, undefined)).toBe(
      `${SECOND_CIRCLE}\n\n${NOBODY_OWN}`,
    );
  });
});
