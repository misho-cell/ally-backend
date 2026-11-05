import { readFileSync } from 'fs';
import { join } from 'path';
import { ClaimKind, OwnerAsk } from '../replyClaims.service';
import { withoutSavedClaimOnAQuestion } from '../savedClaim';
import { claimsRead } from './helpers/replyClaims';

/** 4490 (box 51481, threads 49281 and 49284): „შევინახე" under the answer to a plain question. */
describe('an „I saved" sentence under a plain question', () => {
  const answer = 'ბახვა მუშაობს „საცდელ ლოჯისტიკაში“.';
  const claim = 'შევინახე: ბახვა, სამუშაო ადგილი: „საცდელი ლოჯისტიკა“.';
  const reply = `${answer} ${claim}`;
  const onAQuestion = claimsRead({ [ClaimKind.Saved]: [claim] }, [OwnerAsk.OnlyAsks]);

  it('is taken out when nothing was saved; the answer stays', () => {
    expect(withoutSavedClaimOnAQuestion(reply, onAQuestion, ['search_contact_by_name'])).toBe(
      answer,
    );
  });

  it('stays when a save ran in the run', () => {
    expect(withoutSavedClaimOnAQuestion(reply, onAQuestion, ['save_contact_fact'])).toBe(reply);
  });

  it('stays when the owner did more than ask', () => {
    const told = claimsRead({ [ClaimKind.Saved]: [claim] });
    expect(withoutSavedClaimOnAQuestion(reply, told, [])).toBe(reply);
  });

  it('never empties a reply that is only the claim', () => {
    expect(withoutSavedClaimOnAQuestion(claim, onAQuestion, [])).toBe(claim);
  });

  it('runs on every reply the owner reads', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('finalText = withoutSavedClaimOnAQuestion(finalText, claimsNow');
  });
});
