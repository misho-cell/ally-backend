import { readFileSync } from 'fs';
import { join } from 'path';
import { AskKind, askKindOf } from '../askKind';
import { AskTap, askChoicesFor, askTapOf, isDeclineChoice, laterChoice } from '../askOpening';

/**
 * #2185 — the fixed set the tester asked for (44132): question texts seen on
 * real and fictional screens, and the kind each must be read as. A change to
 * the reading that moves any of them fails here, on every build.
 */
const REGRESSION_SET: readonly (readonly [string, AskKind])[] = [
  // The founder's own screen, 7 Oct: one named person, and an introduction.
  ['იცნობ გიორგი ბერიძეს? თუ კი, გამაცნობ?', AskKind.Intro],
  ['Do you know G, the CFO at a bank? If yes, will you introduce me?', AskKind.Intro],
  ['Could you put me in touch with Nino?', AskKind.Intro],
  // Lika's follow-up (41988): the message ends on „which supplier".
  [
    'ვხსნი სავაჭრო მოლს და რობოტ მტვერსასრუტებს ვაპირებ. რომელ მომწოდებელს მირჩევდი ასეთი დიდი ფართისთვის?',
    AskKind.Open,
  ],
  ['ვის ურჩევდი ბუღალტრად?', AskKind.Open],
  ['Which supplier would you recommend?', AskKind.Open],
  // #1948's own set stays as it was.
  ['ხომ არ იცნობ კარგ სანტექნიკს?', AskKind.Know],
  ['ვინმე ხომ არ იცნობ კარგ იურისტს?', AskKind.Know],
  ['Do you know a good plumber? If yes, can you recommend someone?', AskKind.Know],
  ['Can you help me find a flat in Batumi?', AskKind.Help],
  ['დამეხმარები ბინის პოვნაში?', AskKind.Help],
  ['Who handles hiring at TBC?', AskKind.Open],
  ['როდის გცალია?', AskKind.Open],
  ['ხვალ თავისუფალი ხარ?', AskKind.YesNo],
  ['Are you free tomorrow?', AskKind.YesNo],
];

describe('the regression set of question texts', () => {
  it.each(REGRESSION_SET)('%s → %s', (question, kind) => {
    expect(askKindOf(question)).toBe(kind);
  });
});

describe('an introduction request', () => {
  it('gets „yes, I will introduce you" / „I can’t" / later, in the reader’s language', () => {
    const [yes, no, later] = askChoicesFor('იცნობ გიორგის? თუ კი, გამაცნობ?', 'ka');
    expect([yes, no]).toEqual(['კი, გაგაცნობ', 'ვერ გაგაცნობ']);
    expect(later).toBe(laterChoice('ka'));
    expect(askTapOf(yes)).toBe(AskTap.Yes);
    expect(isDeclineChoice(no)).toBe(true);
    expect(askChoicesFor('Will you introduce me to Nino?', 'en')[0]).toBe(
      "Yes, I'll introduce you",
    );
  });

  it('carries no pick-list under it', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain(
      'pickerNeed && !sameThread && askKindOf(safeQuestion) !== AskKind.Intro',
    );
  });
});

describe('a question asking for a name', () => {
  it('gets only „later" — the text field is the answer, never „Yes, I know someone"', () => {
    expect(askChoicesFor('რომელ მომწოდებელს მირჩევდი?', 'ka')).toEqual([laterChoice('ka')]);
  });
});
