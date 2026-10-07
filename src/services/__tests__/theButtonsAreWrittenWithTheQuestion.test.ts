import {
  AskChoice,
  ChoiceMeaning,
  choicesFromLabels,
  choicesProblem,
  parseAskChoices,
  tapOfChoice,
  withServerLater,
} from '../askChoices';
import { AskTap, askChoices, laterChoice } from '../askOpening';

/**
 * D712 (the founder, 7 Oct): the buttons under a question are written with it,
 * each saying what it means, so a tap still does what it did.
 */
const INTRO: readonly AskChoice[] = [
  { label: 'კი, დაგაკავშირებთ', means: ChoiceMeaning.Yes },
  { label: 'არ ვიცნობ', means: ChoiceMeaning.No },
  { label: 'later', means: ChoiceMeaning.Later },
];

describe('the written buttons', () => {
  it('are read when every one has a label and a meaning', () => {
    expect(parseAskChoices(INTRO)).toEqual(INTRO);
    expect(parseAskChoices([{ label: 'კი', means: 'maybe' }])).toBeNull();
    expect(parseAskChoices([{ label: '', means: 'yes' }])).toBeNull();
    expect(parseAskChoices([{ label: 'x'.repeat(41), means: 'yes' }])).toBeNull();
    expect(parseAskChoices('კი')).toBeNull();
  });

  // D712 rule 4, the part that needs no model to judge.
  it('are no answer set when one alone, more than four, only later, or doubled', () => {
    expect(choicesProblem(INTRO)).toBeNull();
    expect(choicesProblem(INTRO.slice(0, 1))).not.toBeNull();
    expect(
      choicesProblem([...INTRO, ...INTRO.slice(0, 2)].map((c, i) => ({ ...c, label: `${i}` }))),
    ).not.toBeNull();
    expect(
      choicesProblem([
        { label: 'ხვალ', means: ChoiceMeaning.Later },
        { label: 'მერე', means: ChoiceMeaning.Later },
      ]),
    ).not.toBeNull();
    expect(
      choicesProblem([
        { label: 'კი', means: ChoiceMeaning.Yes },
        { label: 'კი', means: ChoiceMeaning.Answer },
      ]),
    ).not.toBeNull();
  });

  it('keep the one „later" label the server answers with days', () => {
    expect(withServerLater(INTRO, 'ka')[2].label).toBe(laterChoice('ka'));
    expect(withServerLater(INTRO, 'ka')[0].label).toBe('კი, დაგაკავშირებთ');
  });

  it('say what a tap means', () => {
    expect(tapOfChoice('კი, დაგაკავშირებთ', INTRO)).toBe(AskTap.Yes);
    expect(tapOfChoice('არ ვიცნობ', INTRO)).toBe(AskTap.Decline);
    expect(tapOfChoice('later', INTRO)).toBe(AskTap.Later);
    expect(tapOfChoice('ვიცნობ ერთს', INTRO)).toBeNull();
    expect(
      tapOfChoice('ნინო ბერიძე', [{ label: 'ნინო ბერიძე', means: ChoiceMeaning.Answer }]),
    ).toBeNull();
  });

  it('read an older ask’s fixed labels as their meanings', () => {
    expect(choicesFromLabels(askChoices('en')).map((c) => c.means)).toEqual([
      ChoiceMeaning.Yes,
      ChoiceMeaning.No,
      ChoiceMeaning.Later,
    ]);
  });
});

describe('ask_contact', () => {
  const { readFileSync } = jest.requireActual<typeof import('fs')>('fs');
  const { join } = jest.requireActual<typeof import('path')>('path');
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('asks the model for the buttons in the same call as the question', () => {
    expect(chat).toContain("required: ['task_id', 'phone', 'question', 'choices'],");
    expect(chat).toContain("means: { type: 'string', enum: ['yes', 'no', 'later', 'answer'] },");
  });

  it('hands them to the ask, and logs a question that came without usable ones', () => {
    expect(chat).toContain("const authored = authoredChoices(runId, input['choices']);");
    expect(chat).toContain('the question came without usable buttons');
  });
});
