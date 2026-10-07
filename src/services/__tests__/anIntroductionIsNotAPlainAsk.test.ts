import { readFileSync } from 'fs';
import { join } from 'path';
import { ownerAsksForIntroduction } from '../introInstruction';

/** T2479 (IN-002 / PR-007): „გამაცანი X, Y იცნობს" went out as a plain ask_contact question. */
describe('anIntroductionIsNotAPlainAsk', () => {
  it('reads the owner’s imperative to introduce them', () => {
    expect(ownerAsksForIntroduction(['გამაცანი თამთა გამოგონილი, ბახვა გამოგონილი იცნობს.'])).toBe(
      true,
    );
    expect(
      ownerAsksForIntroduction(['ვადასტურებ', 'Introduce me to Tamta, Bakhva knows her']),
    ).toBe(true);
  });

  it('leaves case 1 — a question whether the helper will introduce — a question', () => {
    expect(
      ownerAsksForIntroduction([
        'ჰკითხე გიგა ტესტაძეს იცნობს თუ არა გია ბერიძეს და გამაცნობს თუ არა',
      ]),
    ).toBe(false);
  });

  it('is checked before ask_contact sends', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('if (ownerAsksForIntroduction(ownerLines)) {');
  });
});
