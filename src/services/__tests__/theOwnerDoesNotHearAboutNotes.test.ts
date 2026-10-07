import { readFileSync } from 'fs';
import { join } from 'path';
import { withoutNoteTalk } from '../noteTalk';

/** T2478 (AP-001, conv 42660): the owner read the model's answer to a server note. */
describe('theOwnerDoesNotHearAboutNotes', () => {
  it('takes out a sentence about a system note and keeps the rest', () => {
    expect(
      withoutNoteTalk(
        'ეს შენიშვნა ნამდვილად ჩემი სისტემური წესების ნაწილი არ არის. ნინოს კითხვა გავუგზავნე.',
      ),
    ).toBe('ნინოს კითხვა გავუგზავნე.');
    expect(withoutNoteTalk('That system note is not mine. I asked Nino.')).toBe('I asked Nino.');
  });

  it('leaves a reply with no such sentence, and never empties a reply', () => {
    expect(withoutNoteTalk('ნინოს კითხვა გავუგზავნე. პასუხს ველოდები.')).toBe(
      'ნინოს კითხვა გავუგზავნე. პასუხს ველოდები.',
    );
    expect(withoutNoteTalk('ეს შენიშვნა ჩემი არ არის.')).toBe('ეს შენიშვნა ჩემი არ არის.');
  });

  it('runs on every final reply', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('withoutNoteTalk(');
  });
});
