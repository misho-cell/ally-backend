import { readFileSync } from 'fs';
import { join } from 'path';
import { MENTIONED_NOTE_LINE_ON, withMentionedNoteLine } from '../mentionedNoteLine';

/** 4555 (box 51778, 0 of 2 after 0119): „შევინახე: ბახვა, დამსაქმებელი: „სანიმუშო ბანკი" ✓". */
describe('a value kept only as a mentioned note', () => {
  it('replaces the sentence that claims it was saved, once', () => {
    const reply = 'შევინახე: ბახვა, დამსაქმებელი: „სანიმუშო ბანკი“ ✓\nსხვა რამეში დაგეხმარო?';
    expect(withMentionedNoteLine(reply, 'სანიმუშო ბანკი', 'ka', true)).toBe(
      'ეს ჩავინიშნე როგორც ნახსენები: „სანიმუშო ბანკი“. შენი ნათქვამი უცვლელად დარჩა.\nსხვა რამეში დაგეხმარო?',
    );
  });

  it('leaves a reply that does not claim the save alone', () => {
    const reply = 'კარგი, გავიგე.';
    expect(withMentionedNoteLine(reply, 'სანიმუშო ბანკი', 'ka', true)).toBe(reply);
  });

  it('is ON by Misho’s yes (§128, BK), and does nothing when switched off', () => {
    const reply = 'შევინახე: ბახვა, სამსახური: „სანიმუშო ბანკი“.';
    expect(MENTIONED_NOTE_LINE_ON).toBe(true);
    expect(withMentionedNoteLine(reply, 'სანიმუშო ბანკი', 'ka')).not.toBe(reply);
    expect(withMentionedNoteLine(reply, 'სანიმუშო ბანკი', 'ka', false)).toBe(reply);
  });

  it('is applied to every reply, with the value the save kept as a note', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      "finalText = withMentionedNoteLine(finalText, runMentionedNote.get(runId) ?? '', runLang(runId));",
    );
  });
});
