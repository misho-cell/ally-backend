import { readFileSync } from 'fs';
import { join } from 'path';
import { ChoiceMeaning } from '../askChoices';
import { choicesFit, labelFits, messageLanguage } from '../oneLanguageAsk';

/**
 * The tester's 44551 / 44584: an English question with Georgian buttons and an
 * English „later"; a Georgian question under an English lead-in.
 */
describe('one ask, one language', () => {
  it("keeps the reader's language when the body is written in it", () => {
    expect(messageLanguage('Do you know Gia Beridze, the CFO of Orbi?', 'en')).toBe('en');
    expect(messageLanguage('იცნობ გია ბერიძეს?', 'ka')).toBe('ka');
  });

  it("keeps the reader's language when a short body carries none", () => {
    expect(messageLanguage('one more thing', 'ka')).toBe('ka');
  });

  it('follows the body when its translation did not happen', () => {
    expect(messageLanguage('ვის გირჩევდი კარგ ბუღალტრად?', 'en')).toBe('ka');
  });

  it('sees Georgian buttons under an English question', () => {
    const georgian = [
      { label: 'ვიცნობ, გავაცნობ', means: ChoiceMeaning.Yes },
      { label: 'არ ვიცნობ', means: ChoiceMeaning.No },
    ];
    expect(choicesFit(georgian, 'en')).toBe(false);
    expect(choicesFit(georgian, 'ka')).toBe(true);
    expect(labelFits("I'll answer later", 'en')).toBe(true);
    expect(labelFits('Yes', 'es')).toBe(true);
    expect(labelFits('👍', 'ka')).toBe(true);
  });

  it('is applied where the ask is composed, frame and buttons alike', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain('const said = messageLanguage(edited.question, language);');
    expect(asks).toContain('await choicesInLanguage(editedChoices, said, edited.question)');
    expect(asks).toMatch(/buildAskOpening\(\s+said,/u);
  });
});
