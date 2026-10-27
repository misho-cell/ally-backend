import { AskKind, askKindOf } from '../askKind';
import {
  AskTap,
  askChoices,
  askChoicesFor,
  askTapOf,
  isDeclineChoice,
  laterChoice,
} from '../askOpening';

/**
 * #1948 (Lika, iPhone, 6 Oct): the same „Yes, I can help / I can't help /
 * later" came under every question. Done when the tester's three questions
 * and two requests for help arrive with buttons that answer them.
 */
describe('what kind of question it is', () => {
  it.each([
    ['Are you free tomorrow?', AskKind.YesNo],
    ['Do you like Italian cuisine?', AskKind.YesNo],
    ['Do you know a good plumber? If yes, can you recommend someone?', AskKind.Know],
    ['ხომ არ იცნობ კარგ სანტექნიკს?', AskKind.Know],
    ['Знаешь хорошего юриста?', AskKind.Know],
    ['¿Conoces a un buen dentista?', AskKind.Know],
    ['Can you help me find a flat in Batumi?', AskKind.Help],
    ['დამეხმარები ბინის პოვნაში?', AskKind.Help],
    ['Who handles hiring at TBC?', AskKind.Open],
    ['როდის გცალია?', AskKind.Open],
    ['ხვალ თავისუფალი ხარ?', AskKind.YesNo],
  ])('%s → %s', (question, kind) => {
    expect(askKindOf(question)).toBe(kind);
  });
});

describe('the buttons under it', () => {
  it('a yes/no question gets yes / no / later — plain answers, not taps', () => {
    const [yes, no, later] = askChoicesFor('Are you free tomorrow?', 'en');
    expect([yes, no]).toEqual(['Yes', 'No']);
    expect(later).toBe(laterChoice('en'));
    expect(askTapOf(yes)).toBeNull();
    expect(askTapOf(no)).toBeNull();
  });

  it('a „do you know someone" question gets know / don’t know / later', () => {
    const [yes, no, keep, later] = askChoicesFor('ხომ არ იცნობ კარგ სანტექნიკს?', 'ka');
    expect(yes).toBe('კი, ვიცნობ');
    expect(askTapOf(yes)).toBe(AskTap.Yes);
    expect(isDeclineChoice(no)).toBe(true);
    // #7760: „not yet, I'll keep it in mind" closes the ask like a no.
    expect(keep).toBe('ჯერ არავის ვიცნობ, დავიმახსოვრებ');
    expect(isDeclineChoice(keep)).toBe(true);
    expect(askTapOf(later)).toBe(AskTap.Later);
  });

  /** #7760: help and „do you know" asks also offer „not yet, I'll keep it in mind", before „later". */
  it('a request for help keeps the original three, with „keep it in mind" before „later"', () => {
    const [yes, no, later] = askChoices('en');
    expect(askChoicesFor('Can you help me find a flat?', 'en')).toEqual([
      yes,
      no,
      "I don't know anyone yet, I'll keep it in mind",
      later,
    ]);
    expect(askChoicesFor('Do you know a good plumber?', 'en')[2]).toBe(
      "I don't know anyone yet, I'll keep it in mind",
    );
  });

  it('an open question gets only „later" — the text field is the answer', () => {
    expect(askChoicesFor('Who handles hiring at TBC?', 'en')).toEqual([laterChoice('en')]);
  });

  it('never offers „Yes, I can help" except for help', () => {
    const helpYes = askChoices('en')[0];
    for (const q of ['Are you free tomorrow?', 'Do you know a good plumber?', 'Who is the CEO?']) {
      expect(askChoicesFor(q, 'en')).not.toContain(helpYes);
    }
  });

  it('every kind keeps „later", last', () => {
    for (const q of ['Are you free?', 'Do you know a lawyer?', 'Can you help?', 'Who is it?']) {
      const choices = askChoicesFor(q, 'ru');
      expect(choices[choices.length - 1]).toBe(laterChoice('ru'));
    }
  });
});
