import { readFileSync } from 'fs';
import { join } from 'path';
import { instructionSentence, looksLikeContactInstruction } from '../goalIntent';

/**
 * Misho, 7 Oct — D625 as a server rule. The tester's 44132 (owner
 * conversation 42009): context first, „ჰკითხე Nodar Testidze-ს …" last, 173
 * characters — not read as an instruction, and an approve card was drawn.
 */
const LONG =
  'მეყავს ნაცნობი გია ტესტური, რომელიც CFO-ა ერთ კომპანიაში. ვწერ ბიზნეს გეგმას და ' +
  'მჭირდება ფინანსური ექსპერტი. ჰკითხე Nodar Testidze-ს, იცნობს თუ არა გიას და ' +
  'გამაცნობს თუ არა.';

describe('the approve-card guard', () => {
  it('reads the sentence of a long line that carries the instruction', () => {
    expect(instructionSentence(LONG)).toBe(
      'ჰკითხე Nodar Testidze-ს, იცნობს თუ არა გიას და გამაცნობს თუ არა.',
    );
    expect(looksLikeContactInstruction(instructionSentence(LONG))).toBe(true);
  });

  it('leaves a short line, and every other reader of an instruction, as they were', () => {
    expect(instructionSentence('ჰკითხე ნინოს')).toBe('ჰკითხე ნინოს');
    expect(looksLikeContactInstruction(LONG)).toBe(false);
  });

  it('is applied where the plan card is refused', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const guard = chat.slice(chat.indexOf('async function ownerJustInstructedThePlansPeople('));
    expect(guard.slice(0, 900)).toContain('const sentence = instructionSentence(said.trim());');
    expect(guard.slice(0, 900)).toContain(
      'if (!looksLikeContactInstruction(sentence)) return false;',
    );
  });
});
