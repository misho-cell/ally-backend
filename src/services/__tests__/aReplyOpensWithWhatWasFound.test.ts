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

describe('the tester’s 1044, thread 30726', () => {
  it('moves a „ვერაფერი მოიძებნა" opening behind a plan label, and drops the label', () => {
    const opening =
      'გეგმა ასე გამოიყურება: შენს კონტაქტებშიც და მეორე წრეშიც ვეძებე ვეტერინარი თბილისში, არც ერთი ვერსიით ვერაფერი მოიძებნა.';
    const web = 'ვებზე სამი კლინიკა ვნახე:\n\n1. ვეტკლინიკა https://vet.ge';
    expect(withNothingFoundLast(`${opening} ${web}`)).toBe(
      `${web}\n\nშენს კონტაქტებშიც და მეორე წრეშიც ვეძებე ვეტერინარი თბილისში, არც ერთი ვერსიით ვერაფერი მოიძებნა.`,
    );
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

/** The tester's 1046: the two openings that stayed as written on the live build. */
describe('the tester’s 1046', () => {
  it('moves 30757 (a label, „ვერ ვიპოვე" mid-sentence, a tail clause)', () => {
    const opening =
      'ქუთაისში ვეტერინარებზე მოვიძიე: შენს კონტაქტებში და მათ კონტაქტებშიც ვერ ვიპოვე პირდაპირი კავშირი ვერც ერთ ვეტერინართან, ასე რომ ეს გზა ჯერ ცარიელია.';
    const web = 'ვებზე ორი კონკრეტული სახელი გამოჩნდა:\n\nhttps://vet.ge';
    const out = withNothingFoundLast(`${opening}\n\n${web}`);
    expect(out.startsWith('ვებზე ორი')).toBe(true);
    expect(out).toContain('ასე რომ ეს გზა ჯერ ცარიელია.');
  });

  it('moves 30823 („არავინ აღმოჩნდა", a bracket inside)', () => {
    const opening =
      'შენს კონტაქტებში (სულ 15, მათგან 4 წევრია Netai-ზე) იაპონურ თარგმანთან კავშირში არავინ აღმოჩნდა, არც პირდაპირ და არც კონტაქტების კონტაქტებში.';
    const web = 'ვებში ორი კონკრეტული სახელი ვიპოვე:\n\nთათია მემარნიშვილი';
    expect(withNothingFoundLast(`${opening}\n\n${web}`).startsWith('ვებში ორი')).toBe(true);
  });
});
