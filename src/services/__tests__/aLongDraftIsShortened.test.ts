import { readFileSync } from 'fs';
import { join } from 'path';
import { acceptShortened, LONG_DRAFT_CHARS, linksOf, SHORTEN_DRAFT_PROMPT } from '../shortenDraft';

/** The tester's 1111 (L7): plan-turn replies ran to 600–1,300 characters; the founder wants one screen. */
describe('a long draft', () => {
  const draft =
    'ვაკეში ორი ვარიანტი ვიპოვე. JUST, ილია ჭავჭავაძის 70, გვერდი: https://justmassage.ge ' +
    'და Ann Maison, ტელეფონი: ⟦own⟧+995 591 00 00 00⟦/own⟧. '.repeat(3);

  it('is shortened only past one screen', () => {
    expect(LONG_DRAFT_CHARS).toBe(600);
    expect(SHORTEN_DRAFT_PROMPT).toContain('every person’s name, every link');
    expect(SHORTEN_DRAFT_PROMPT).toContain('„შენ"');
  });

  it('takes the shorter text when every link and number stayed', () => {
    const short = 'JUST: https://justmassage.ge. Ann Maison: ⟦own⟧+995 591 00 00 00⟦/own⟧.';
    expect(acceptShortened(draft, short)).toBe(short);
  });

  it('keeps the draft when a link was lost, nothing came back, or it did not get shorter', () => {
    expect(acceptShortened(draft, 'JUST და Ann Maison.')).toBeNull();
    expect(acceptShortened(draft, null)).toBeNull();
    expect(acceptShortened(draft, `${draft} more`)).toBeNull();
  });

  it('reads links and wrapped numbers', () => {
    expect(linksOf(draft)).toContain('https://justmassage.ge');
    expect(linksOf(draft).some((l) => l.startsWith('⟦own⟧'))).toBe(true);
  });

  it('runs only where Claude’s draft became the reply', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const at = chat.indexOf('finalText = draft.text;');
    expect(chat.slice(at, at + 400)).toContain('if (finalText.length > LONG_DRAFT_CHARS) {');
  });
});
