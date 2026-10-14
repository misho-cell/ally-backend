import { readFileSync } from 'fs';
import { join } from 'path';
import { allDormantLabels, DORMANT_CHOICES_ON, dormantChoices } from '../dormantChoices';

/**
 * 0266 part 1 (the tester's 58043): the never-opened line came with no buttons.
 * The two labels are owner-facing; Misho said yes on 14 October.
 */
describe('the never-opened line’s buttons', () => {
  it('are on since Misho’s yes (14 October)', () => {
    expect(DORMANT_CHOICES_ON).toBe(true);
    expect(dormantChoices('ka')).toEqual(['მაინც გაუგზავნე', 'სხვა გზა ვეძებოთ']);
  });

  it('are none when the switch is off', () => {
    expect(dormantChoices('ka', false)).toBeUndefined();
  });

  it('are two, in the owner’s language, when on', () => {
    expect(dormantChoices('ka', true)).toEqual(['მაინც გაუგზავნე', 'სხვა გზა ვეძებოთ']);
    expect(dormantChoices('en', true)).toEqual(['Send it anyway', "Let's find another way"]);
  });

  it('pass the button editor untouched: they are approved text', () => {
    const buttons = readFileSync(join(__dirname, '..', 'ownerButtons.service.ts'), 'utf8');
    expect(buttons).toContain('...allDormantLabels()');
    expect(allDormantLabels()).toHaveLength(8);
  });

  it('ride with the server’s never-opened line, and leave other buttons alone while off', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'return { text: dormantSentence(introduced, language), choices: dormantChoices(language) };',
    );
    expect(chat).toContain('if (line.choices !== undefined) choices = line.choices;');
  });
});
