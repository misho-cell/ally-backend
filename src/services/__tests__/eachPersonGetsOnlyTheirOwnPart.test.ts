import { askIsTheIntroduction, OWN_PART_ONLY_ON } from '../introInstruction';
import { OTHER_PART_REFUSAL, questionCarriesAnotherPart } from '../ownPart';

/**
 * 4655 rebuilt (the tester's 55954 and 56014). One sentence, two requests: the
 * question to Gela goes, but carries only Gela's part — never Levan's
 * introduction. OFF until Misho's yes on the refusal sentence.
 */
const OWNER = ['გელას ჰკითხე, ხომ არ იცის კარგი სანტექნიკოსი, და ლევანს სთხოვე, გამაცნოს ნინო.'];
const GELA = 'გელა გამოგონილი';
const LEVAN = 'ლევან საცდელი';

describe('each person gets only their own part (4655)', () => {
  it('ships OFF: with the split off, the guard behaves as main does now', () => {
    expect(OWN_PART_ONLY_ON).toBe(false);
    expect(askIsTheIntroduction(OWNER, GELA, false)).toBe(true);
    expect(questionCarriesAnotherPart(OWNER, GELA, 'და ლევანმა გააცნოს ნინო', false)).toBe(false);
  });

  it('with the split on, the question to Gela is a question', () => {
    expect(askIsTheIntroduction(OWNER, GELA, true)).toBe(false);
    expect(askIsTheIntroduction(OWNER, LEVAN, true)).toBe(true);
  });

  it.each([
    '…ხომ არ იცი ვინმე? და ლევანმა გააცნოს ნინო.',
    'ხომ არ იცი კარგი სანტექნიკოსი და ხომ არ შეგიძლია ლევანთან ნინო გააცნო?',
  ])('refuses Gela’s question that carries Levan’s part (56014): „%s"', (question) => {
    expect(questionCarriesAnotherPart(OWNER, GELA, question, true)).toBe(true);
  });

  it('lets Gela’s own part through', () => {
    expect(
      questionCarriesAnotherPart(OWNER, GELA, 'ხომ არ იცი კარგი სანტექნიკოსი თბილისში?', true),
    ).toBe(false);
  });

  it('never catches a message with one request only', () => {
    expect(
      questionCarriesAnotherPart(
        ['ლევანს სთხოვე, გამაცნოს ნინო.'],
        LEVAN,
        'ნინოს გაცნობა უნდა, შეგიძლია?',
        true,
      ),
    ).toBe(false);
  });

  it('tells the model to send each part to its own person', () => {
    expect(OTHER_PART_REFUSAL).toContain('only their own part');
    expect(OTHER_PART_REFUSAL).toContain('request_introduction');
  });
});
