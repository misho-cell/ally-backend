import { readFileSync } from 'fs';
import { join } from 'path';
import { withoutSavedClaimOnAQuestion } from '../savedClaim';

/** 4490 (box 51481, threads 49281 and 49284): „შევინახე" under the answer to a plain question. */
describe('an „I saved" sentence under a plain question', () => {
  const asked = 'სად მუშაობს ბახვა?';

  it('is taken out when nothing was saved; the answer stays', () => {
    const reply =
      'ბახვა მუშაობს „საცდელ ლოჯისტიკაში“.  შევინახე: ბახვა, სამუშაო ადგილი: „საცდელი ლოჯისტიკა“.';
    expect(withoutSavedClaimOnAQuestion(reply, asked, ['search_contact_by_name'])).toBe(
      'ბახვა მუშაობს „საცდელ ლოჯისტიკაში“.',
    );
  });

  it('stays when a save ran in the run', () => {
    const reply = 'ბახვა მუშაობს „საცდელ ლოჯისტიკაში“. შევინახე.';
    expect(withoutSavedClaimOnAQuestion(reply, asked, ['save_contact_fact'])).toBe(reply);
  });

  it('stays when the owner’s line was not a question', () => {
    const reply = 'შევინახე: ბახვა „საცდელ ლოჯისტიკაში“ მუშაობს.';
    expect(withoutSavedClaimOnAQuestion(reply, 'ბახვა ახლა ლოჯისტიკაშია', [])).toBe(reply);
  });

  it('leaves „it is saved" alone — that can be true of an earlier save', () => {
    const reply = 'ბახვას სამსახური უკვე შენახულია: „საცდელი ლოჯისტიკა“.';
    expect(withoutSavedClaimOnAQuestion(reply, asked, [])).toBe(reply);
  });

  it('never empties a reply that is only the claim', () => {
    expect(withoutSavedClaimOnAQuestion('შევინახე.', asked, [])).toBe('შევინახე.');
  });

  it.each([
    [
      'ბახვა ძველაძე ადრე თიბისი ბანკში მუშაობდა. ახლა ვისოლშია.\n\nვინახავ: ბახვა ძველაძე, სამუშაო ადგილი: ვისოლი.',
      'ბახვა ძველაძე ადრე თიბისი ბანკში მუშაობდა. ახლა ვისოლშია.',
    ],
    ['ბახვა ვისოლშია. დავიმახსოვრებ.', 'ბახვა ვისოლშია.'],
    ["Bakhva works at Visol. I'll save that.", 'Bakhva works at Visol.'],
  ])('takes out the present and future tense too (tester 56531): „%s"', (reply, kept) => {
    expect(withoutSavedClaimOnAQuestion(reply, 'ვინ მუშაობდა ადრე თიბისი ბანკში?', [])).toBe(kept);
  });

  it('leaves a line about the owner saving alone', () => {
    const reply = 'ბახვა ვისოლშია. თუ გინდა, ნომერს შეინახავ?';
    expect(withoutSavedClaimOnAQuestion(reply, asked, [])).toBe(reply);
  });

  it('runs on every reply the owner reads', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('finalText = withoutSavedClaimOnAQuestion(');
  });
});
