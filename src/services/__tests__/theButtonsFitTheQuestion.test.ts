import { readFileSync } from 'fs';
import { join } from 'path';
import { ASK_KIND_FIELD, AskKind, askKindFrom } from '../askKind';
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
 * later" came under every question. The buttons follow the kind of question.
 *
 * #8779 group 4 (the founder, 4 Nov): the kind is the asking model's word
 * (ask_contact's `kind`), stored with the ask — no longer read off the words.
 */
describe('the kind of question', () => {
  it('is the model’s word, and the open set when it gave none or something else', () => {
    expect(askKindFrom('intro')).toBe(AskKind.Intro);
    expect(askKindFrom('yes_no')).toBe(AskKind.YesNo);
    expect(askKindFrom(undefined)).toBe(AskKind.Open);
    expect(askKindFrom('maybe')).toBe(AskKind.Open);
    expect(askKindFrom(3)).toBe(AskKind.Open);
  });

  it('is declared to the model as a closed set', () => {
    expect([...ASK_KIND_FIELD.enum].sort()).toEqual(Object.values(AskKind).sort());
  });

  it('is passed by ask_contact and kept with the ask for reminders and evening cards', () => {
    const src = (file: string): string => readFileSync(join(__dirname, '..', file), 'utf8');
    expect(src('chat.service.ts')).toContain("askKindFrom(input['kind']),");
    expect(src('taskAsks.service.ts')).toContain('anonymous, ask_kind)');
    expect(src('taskAsks.service.ts')).toContain(
      'askChoicesFor(askKindFrom(row.ask_kind), language)',
    );
    expect(src('eveningCard.service.ts')).toContain(
      'askChoicesFor(askKindFrom(ask_kind), language)',
    );
    expect(src('askKind.ts')).not.toMatch(/_RE\b/u);
  });
});

describe('the buttons under it', () => {
  it('a yes/no question gets yes / no / later — plain answers, not taps', () => {
    const [yes, no, later] = askChoicesFor(AskKind.YesNo, 'en');
    expect([yes, no]).toEqual(['Yes', 'No']);
    expect(later).toBe(laterChoice('en'));
    expect(askTapOf(yes)).toBeNull();
    expect(askTapOf(no)).toBeNull();
  });

  it('a „do you know someone" question gets know / don’t know / later', () => {
    const [yes, no, keep, later] = askChoicesFor(AskKind.Know, 'ka');
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
    expect(askChoicesFor(AskKind.Help, 'en')).toEqual([
      yes,
      no,
      "I don't know anyone yet, I'll keep it in mind",
      later,
    ]);
    expect(askChoicesFor(AskKind.Know, 'en')[2]).toBe(
      "I don't know anyone yet, I'll keep it in mind",
    );
  });

  it('an introduction request gets „yes, I will introduce you" / „I can’t" / later', () => {
    const [yes, no, later] = askChoicesFor(AskKind.Intro, 'ka');
    expect([yes, no]).toEqual(['კი, გაგაცნობ', 'ვერ გაგაცნობ']);
    expect(later).toBe(laterChoice('ka'));
    expect(askTapOf(yes)).toBe(AskTap.Yes);
    expect(isDeclineChoice(no)).toBe(true);
    expect(askChoicesFor(AskKind.Intro, 'en')[0]).toBe("Yes, I'll introduce you");
  });

  it('an open question gets only „later" — the text field is the answer', () => {
    expect(askChoicesFor(AskKind.Open, 'en')).toEqual([laterChoice('en')]);
  });

  it('never offers „Yes, I can help" except for help', () => {
    const helpYes = askChoices('en')[0];
    for (const kind of [AskKind.YesNo, AskKind.Know, AskKind.Open, AskKind.Intro]) {
      expect(askChoicesFor(kind, 'en')).not.toContain(helpYes);
    }
  });

  it('every kind that asks something keeps „later", last', () => {
    // A notice asks nothing, so it has no buttons at all (Tornike's 8 Nov report, #9).
    for (const kind of Object.values(AskKind).filter((k) => k !== AskKind.Notice)) {
      const choices = askChoicesFor(kind, 'ru');
      expect(choices[choices.length - 1]).toBe(laterChoice('ru'));
    }
  });

  it('an introduction request carries no pick-list under it', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain(
      'const pickerAllowed = !sameThread && askKind !== AskKind.Intro && !isNotice;',
    );
  });
});
