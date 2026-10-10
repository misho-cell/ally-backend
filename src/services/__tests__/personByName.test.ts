import { readFileSync } from 'fs';
import { join } from 'path';
import { asksForAPersonByName, WEB_TOOL_NAMES } from '../personByName';

/** 3730 (3), 3732: a person named to meet or reach is never looked up on the web. */
describe('asksForAPersonByName', () => {
  it('holds the web for a named person to meet or reach', () => {
    expect(asksForAPersonByName('როგორ მივწვდე ბახვა გამოგონილს?')).toBe(true);
    expect(asksForAPersonByName('გამაცანი ნინო სატესტო, გთხოვ')).toBe(true);
    expect(asksForAPersonByName('დამაკავშირე თამუნასთან')).toBe(true);
    expect(asksForAPersonByName('Please introduce me to Nino Testadze')).toBe(true);
    expect(asksForAPersonByName('How can I reach Giorgi Example?')).toBe(true);
  });

  it('keeps the web for a trade, or a line that asks for no one', () => {
    expect(asksForAPersonByName('გამაცანი კარგი ბუღალტერი')).toBe(false);
    expect(asksForAPersonByName('დამაკავშირე კბილის ექიმთან')).toBe(false);
    expect(asksForAPersonByName('introduce me to a lawyer')).toBe(false);
    expect(asksForAPersonByName('როგორ მივწვდე ბუღალტერს?')).toBe(false);
    expect(asksForAPersonByName('დამაკავშირე იურისტთან.')).toBe(false);
    expect(asksForAPersonByName('რა ამინდია თბილისში?')).toBe(false);
    expect(asksForAPersonByName('ვინ იცნობს ბახვას?')).toBe(false);
  });

  it('names both web tools', () => {
    expect([...WEB_TOOL_NAMES].sort()).toEqual(['fetch_page', 'web_search']);
  });

  it('is applied to the owner run tools, beside the invite holds', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('const webHeld = ownerAbsent || !asksForAPersonByName(userMessage);');
    expect(chat).toContain('(webHeld || !WEB_TOOL_NAMES.has(tool.name)),');
  });
});
