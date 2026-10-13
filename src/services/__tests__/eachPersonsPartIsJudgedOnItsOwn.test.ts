import { askIsTheIntroduction } from '../introInstruction';

const MIXED = ['სთხოვე ნინოს, გამაცნოს რეზო. ასევე ჰკითხე გელას, ხომ არ იცნობს სხვა ინვესტორს.'];

/** Box 54175: an introduction and a plain question in one message. */
describe('each person’s part of the owner’s message is judged on its own', () => {
  it('lets the plain question to the second person go as a question', () => {
    expect(askIsTheIntroduction(MIXED, 'გელა გამოგონილი')).toBe(false);
  });

  it('keeps the go-between’s part an introduction', () => {
    expect(askIsTheIntroduction(MIXED, 'ნინო საცდელი')).toBe(true);
  });

  it('keeps the introduction when the recipient’s name is unknown or not in the owner’s words', () => {
    expect(askIsTheIntroduction(MIXED, '')).toBe(true);
    expect(askIsTheIntroduction(['გამაცანი თამთა.', 'ბახვა იცნობს.'], 'ბახვა ფიქტიური')).toBe(
      false,
    );
    expect(askIsTheIntroduction(['გამაცანი თამთა, ბახვა იცნობს.'], 'ბახვა ფიქტიური')).toBe(true);
    expect(askIsTheIntroduction(['გამაცანი თამთა.'], 'ლევანი')).toBe(true);
  });

  it('is never an introduction when the owner asked for none', () => {
    expect(askIsTheIntroduction(['ჰკითხე გელას, იცნობს თუ არა ინვესტორს.'], 'გელა')).toBe(false);
  });

  it('reads a Latin name too', () => {
    const mixed = ['Ask Nino to introduce me to Rezo. Also ask Gela if he knows another investor.'];
    expect(askIsTheIntroduction(['introduce me to Rezo through Nino. ' + mixed[0]], 'Gela')).toBe(
      false,
    );
  });
});

/**
 * The tester's 55954 (0 of 2): the two requests joined by „, და" in ONE
 * sentence — every ask to Gela was refused as an introduction.
 */
describe('two requests in one sentence (55954)', () => {
  const ONE_SENTENCE = [
    'გელას ჰკითხე, ხომ არ იცის კარგი სანტექნიკოსი, და ლევანს სთხოვე, გამაცნოს ნინო.',
  ];

  it('lets the question to Gela go as a question', () => {
    expect(askIsTheIntroduction(ONE_SENTENCE, 'გელა გამოგონილი')).toBe(false);
  });

  it('keeps Levan’s part the introduction', () => {
    expect(askIsTheIntroduction(ONE_SENTENCE, 'ლევან საცდელი')).toBe(true);
  });

  it('splits on „, ასევე" and on a semicolon too', () => {
    expect(
      askIsTheIntroduction(
        ['ლევანს სთხოვე, გამაცნოს ნინო, ასევე გელას ჰკითხე სანტექნიკოსზე.'],
        'გელა',
      ),
    ).toBe(false);
    expect(
      askIsTheIntroduction(['ლევანს სთხოვე, გამაცნოს ნინო; გელას ჰკითხე სანტექნიკოსზე.'], 'გელა'),
    ).toBe(false);
  });

  it('keeps one introduction of two people whole: a bare „და" splits nothing', () => {
    expect(askIsTheIntroduction(['გამაცანი ნინო და გიორგი.'], 'გიორგი ტესტაძე')).toBe(true);
  });

  it('keeps the go-between’s comma inside the introduction', () => {
    expect(askIsTheIntroduction(['ლევანს სთხოვე, გამაცნოს ნინო.'], 'ლევან საცდელი')).toBe(true);
  });
});
