jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: jest.fn() } },
}));
jest.mock('../costLedger.service', () => ({ recordClaudeUsage: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { ChoiceMeaning, withoutPointingAnswers } from '../askChoices';
import { rewriteFrom } from '../askEditor.service';
import { thirdPersonTurnedToYou } from '../personFlip';

/**
 * 2579, the 15:00Z evening card on 8 Oct (fictional seats 180368, 179135).
 * (1) Ask 16678 reached the helper as „იცნობს თუ არა კარგ ბუღალტერს." The
 * editor rewrote it to „you", and the third-person check threw that away.
 * (2) Ask 16669, „რომელ სპორტდარბაზში დადიხარ?", carried the button
 * „ამ სპორტდარბაზში დავდივარ", which names no gym.
 */

describe('a question that opens with „knows" is about the reader', () => {
  it('may be turned to „you"', () => {
    expect(thirdPersonTurnedToYou('იცნობს თუ არა კარგ ბუღალტერს.', 'იცნობ კარგ ბუღალტერს?')).toBe(
      false,
    );
  });

  it('a named person who knows stays in the third person (#2212)', () => {
    expect(thirdPersonTurnedToYou('ნიკა იცნობს კარგ ბუღალტერს?', 'იცნობ კარგ ბუღალტერს?')).toBe(
      true,
    );
    expect(thirdPersonTurnedToYou('შაბათსაც მუშაობს?', 'შაბათობითაც მუშაობ?')).toBe(true);
  });

  it('the editor rewrite of ask 16678 is now used', () => {
    const draft = {
      question: 'იცნობს თუ არა კარგ ბუღალტერს.',
      choices: [
        { label: 'კი, ვიცნობ', means: ChoiceMeaning.Yes },
        { label: 'არა, არ ვიცნობ', means: ChoiceMeaning.No },
      ],
    };
    const rewritten = rewriteFrom(
      { ok: false, question: 'იცნობ კარგ ბუღალტერს?', choices: draft.choices },
      draft,
    );
    expect(rewritten?.question).toBe('იცნობ კარგ ბუღალტერს?');
  });
});

describe('an answer button that only points goes', () => {
  const gym = [
    { label: 'ამ სპორტდარბაზში დავდივარ', means: ChoiceMeaning.Answer },
    { label: 'არცერთში არ დავდივარ', means: ChoiceMeaning.No },
    { label: 'მოგვიანებით გიპასუხებ', means: ChoiceMeaning.Later },
  ];

  it('drops „ამ სპორტდარბაზში დავდივარ"', () => {
    expect(withoutPointingAnswers(gym).map((c) => c.label)).toEqual([
      'არცერთში არ დავდივარ',
      'მოგვიანებით გიპასუხებ',
    ]);
  });

  it('keeps a concrete answer, and a yes that starts with a pointer', () => {
    const choices = [
      { label: 'Fitness Pro-ში', means: ChoiceMeaning.Answer },
      { label: 'ამ კვირაში კი', means: ChoiceMeaning.Yes },
      { label: 'არა', means: ChoiceMeaning.No },
    ];
    expect(withoutPointingAnswers(choices)).toEqual(choices);
  });

  it('keeps everything when dropping would leave too few buttons', () => {
    const two = [gym[0], gym[2]];
    expect(withoutPointingAnswers(two)).toEqual(two);
  });

  it('every ask passes its buttons through it', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain('withoutPointingAnswers(await choicesInLanguage(editedChoices');
  });
});

/** 1850 card (box 48942): „ხომ არ" in front puts nobody before „იცნობს" — „you" is the fix. */
describe('a question that opens with particles, then „knows"', () => {
  it('takes the editor’s „you"', () => {
    expect(
      thirdPersonTurnedToYou('ხომ არ იცნობს კარგ ბუღალტერს.', 'ხომ არ იცნობ კარგ ბუღალტერს?'),
    ).toBe(false);
  });

  it('still keeps a named person third person after the particles', () => {
    expect(thirdPersonTurnedToYou('ხომ არ მუშაობს ზაზა შაბათსაც?', 'ხომ არ მუშაობ შაბათსაც?')).toBe(
      true,
    );
  });
});
