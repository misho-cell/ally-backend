import { readFileSync } from 'fs';
import { join } from 'path';
import { NAMED_PERSON_NOT_ON_THE_WEB, asksWhoHoldsAPost } from '../personByName';

/**
 * 3730 (3) / 3732: a person the owner names is reached through the network,
 * never on the web. #8779 group 4: the web tools are no longer taken away on
 * MEET_OR_REACH_RE — the rule is web_search's own description.
 */
describe('a named person and the web', () => {
  it('knows a line that asks who holds a post (#8350, tester 78509)', () => {
    expect(asksWhoHoldsAPost('ვინ ხელმძღვანელობს ბათუმის მერიის ტრანსპორტის სამსახურს ახლა')).toBe(
      true,
    );
    expect(asksWhoHoldsAPost('who heads the city transport service?')).toBe(true);
    expect(asksWhoHoldsAPost('მინდა ბუღალტერი')).toBe(false);
  });

  it('is web_search’s own rule, with the trade and the post exceptions', () => {
    expect(NAMED_PERSON_NOT_ON_THE_WEB).toContain('never on the web');
    expect(NAMED_PERSON_NOT_ON_THE_WEB).toContain('who holds a post');
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const tool = chat.slice(chat.indexOf('  web_search: {'));
    expect(tool.slice(0, 1500)).toContain('NAMED_PERSON_NOT_ON_THE_WEB,');
    expect(chat).not.toContain('webHeld');
  });
});
