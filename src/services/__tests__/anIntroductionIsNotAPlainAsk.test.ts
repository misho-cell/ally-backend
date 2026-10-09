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

  it('reads „ask X to introduce me to Y" as the same request (3697)', () => {
    expect(ownerAsksForIntroduction(['სთხოვე მაია გამოგონილს, გამაცნოს ბახვა ფიქტიური.'])).toBe(
      true,
    );
    expect(
      ownerAsksForIntroduction(['Ask Maia Gamogonili to introduce me to Bakhva Fiktiuri.']),
    ).toBe(true);
    expect(ownerAsksForIntroduction(['ჰკითხე მაიას, გაგვაცნოს თუ არა ბახვა'])).toBe(true);
  });

  it('lets the run’s question to the owner stand instead of „not sent" (3697)', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      "ownerAsksForIntroduction([runOwnerLine.get(runId) ?? '']) && endsWithQuestion(finalText);",
    );
    expect(chat).toMatch(/!claimedAnAskNobodyGot &&\s+!introductionQuestion &&/u);
  });

  it('is checked before ask_contact sends', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('if (ownerAsksForIntroduction(ownerLines)) {');
  });
});
