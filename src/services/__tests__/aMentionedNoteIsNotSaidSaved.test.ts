import { readFileSync } from 'fs';
import { join } from 'path';
import { MENTIONED_NOTE_LINE_ON, withMentionedNoteLine } from '../mentionedNoteLine';
import { ClaimKind } from '../replyClaims.service';
import { claimsRead } from './helpers/replyClaims';

/** 4555 (box 51778, 0 of 2 after 0119): „შევინახე: ბახვა, დამსაქმებელი: „სანიმუშო ბანკი" ✓". */
describe('a value kept only as a mentioned note', () => {
  const claimLine = 'შევინახე: ბახვა, დამსაქმებელი: „სანიმუშო ბანკი“ ✓';
  const reply = `${claimLine}\nსხვა რამეში დაგეხმარო?`;
  const claims = claimsRead({ [ClaimKind.Saved]: [claimLine] });
  const line = 'ეს ჩავინიშნე როგორც ნახსენები: „სანიმუშო ბანკი“. შენი ნათქვამი უცვლელად დარჩა.';

  it('replaces the sentence the model read as a save claim, once', () => {
    expect(withMentionedNoteLine(reply, 'სანიმუშო ბანკი', 'ka', claims, true)).toBe(
      `${line}\nსხვა რამეში დაგეხმარო?`,
    );
  });

  it('leaves a save claim about something else alone', () => {
    const other = claimsRead({ [ClaimKind.Saved]: ['სხვა რამეში დაგეხმარო?'] });
    expect(withMentionedNoteLine(reply, 'სანიმუშო ბანკი', 'ka', other, true)).toBe(reply);
  });

  it('leaves a reply that claims no save alone', () => {
    expect(withMentionedNoteLine(reply, 'სანიმუშო ბანკი', 'ka', claimsRead({}), true)).toBe(reply);
  });

  it('is ON by Misho’s yes (§128, BK), and does nothing when switched off', () => {
    expect(MENTIONED_NOTE_LINE_ON).toBe(true);
    expect(withMentionedNoteLine(reply, 'სანიმუშო ბანკი', 'ka', claims)).not.toBe(reply);
    expect(withMentionedNoteLine(reply, 'სანიმუშო ბანკი', 'ka', claims, false)).toBe(reply);
  });

  it('is applied to every reply, with the value the save kept as a note', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('finalText = withMentionedNoteLine(');
  });
});
