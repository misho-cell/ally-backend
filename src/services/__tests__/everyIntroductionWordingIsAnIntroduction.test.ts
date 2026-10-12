import { readFileSync } from 'fs';
import { join } from 'path';
import { ownerAsksForIntroduction } from '../introInstruction';

/** 2311 (box 54162): three ways of asking for an introduction went out as plain asks. */
describe('every wording of an introduction is an introduction', () => {
  it.each([
    'სთხოვე ლევან საცდელაძეს, დამაკავშიროს თამთა ნიმუშაძესთან.',
    'მაია გამოგონილს თხოვე ბახვა ფიქტიურთან დაკავშირება.',
    'სთხოვე ნანას, შემაერთოს გურამთან.',
    'ნანა გამოგონილაძეს სთხოვე, გამაცნოს გურამ ფიქციაშვილი.',
  ])('reads „%s" as an introduction', (line) => {
    expect(ownerAsksForIntroduction([line])).toBe(true);
  });

  it.each([
    'ჰკითხე ბექა ნიმუშაშვილს, შემაერთებს თუ არა ირმა გამოგონილთან.',
    'ჰკითხე გიას, გამაცნობს თუ არა ნინოს.',
    'დამაკავშირდი ხვალ.',
    'ჰკითხე ნინოს, კარგ სტომატოლოგს თუ იცნობს.',
  ])('keeps „%s" a question', (line) => {
    expect(ownerAsksForIntroduction([line])).toBe(false);
  });

  it('never lets the server send an introduction as its own plain question', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const guard = chat.indexOf("if (ownerAsksForIntroduction([runOwnerLine.get(runId) ?? ''])) {");
    const send = chat.indexOf('await sendInstructedAsk(userId, threadId', guard);
    expect(guard).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(guard);
  });
});
