import { readFileSync } from 'fs';
import { join } from 'path';
import { contactInstructionIn } from '../instructionUnsent';
import {
  askIsTheIntroduction,
  ownerAsksForIntroduction,
  OWN_PART_ONLY_ON,
} from '../introInstruction';
import { OTHER_PART_REFUSAL, questionCarriesAnotherPart } from '../ownPart';

/**
 * 4655 rebuilt (the tester's 55954 and 56014). One sentence, two requests: the
 * question to Gela goes, but carries only Gela's part — never Levan's
 * introduction. ON (Misho's yes on the refusal sentence, §139), off under D710
 * on 13 Oct, on again 14 Oct once 56802's leak was traced to the server's own send.
 */
const OWNER = ['გელას ჰკითხე, ხომ არ იცის კარგი სანტექნიკოსი, და ლევანს სთხოვე, გამაცნოს ნინო.'];
const GELA = 'გელა გამოგონილი';
const LEVAN = 'ლევან საცდელი';

describe('each person gets only their own part (4655)', () => {
  it('is ON: with the split off, Gela’s question would be refused as an introduction', () => {
    expect(OWN_PART_ONLY_ON).toBe(true);
    expect(askIsTheIntroduction(OWNER, GELA, false)).toBe(true);
    expect(questionCarriesAnotherPart(OWNER, GELA, 'და ლევანმა გააცნოს ნინო', false)).toBe(false);
  });

  /**
   * 56802 (13 Oct 13:03Z): both of Gela's messages carried Levan's part. They were
   * written by the server's own send, not the model; this check refuses both, and
   * the server's send now sends nothing for a sentence that holds an introduction.
   */
  it.each([
    'გაეცანი: კარგ სანტექნიკოსს ხომ არ იცნობ? ასევე, ტესტ ორი თხოვნა-ს უნდა, რომ ლევანმა ნინოს გააცნოს.',
    'კარგ სანტექნიკოსს ხომ არ იცნობ? ასევე, შეგიძლია ლევანს სთხოვო, ნინოს გააცნოს ის?',
  ])('refuses 56802’s leaked message: „%s"', (question) => {
    expect(questionCarriesAnotherPart(OWNER, GELA, question, true)).toBe(true);
  });

  it('the server’s own send stands back from the two-request sentence (0256)', () => {
    const sentence = contactInstructionIn(OWNER[0]);
    expect(sentence).not.toBeNull();
    expect(ownerAsksForIntroduction([sentence ?? ''])).toBe(true);
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

/**
 * 58029, run 2 (14 Oct 08:44Z): the model's question to Gela passed the check,
 * and the server's editor, holding it to the owner's line, wrote Levan's part back
 * in. The edit is held to the same check, and the checked draft goes instead.
 */
describe('the editor’s rewrite keeps to the person’s own part (58029)', () => {
  const EDITED =
    'იცი კარგი სანტექნიკოსი? და თუ შეგიძლია, ლევანს სთხოვე, Owner 4655-2 ნინოს გააცნოს.';
  const ASKS = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

  it('catches the rewrite Gela received', () => {
    expect(questionCarriesAnotherPart(OWNER, 'გელა ბერიძე', EDITED, true)).toBe(true);
    expect(
      questionCarriesAnotherPart(OWNER, 'გელა ბერიძე', 'იცი კარგი სანტექნიკოსი ვინმე?', true),
    ).toBe(false);
  });

  it('sends the checked draft when the editor’s rewrite carries another part', () => {
    expect(ASKS).toContain(
      'questionCarriesAnotherPart(ownerWords, toName, editorsDraft.question, OWN_PART_ONLY_ON)',
    );
    const guard = ASKS.indexOf('questionCarriesAnotherPart(ownerWords, toName');
    expect(ASKS.slice(guard, guard + 200)).toContain('? draftAsk');
    expect(ASKS.indexOf('const edited = {\n    ...editorsAsk,')).toBeGreaterThan(guard);
  });
});
