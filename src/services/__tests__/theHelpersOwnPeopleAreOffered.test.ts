import { readFileSync } from 'fs';
import { join } from 'path';
import { AskChoice, ChoiceMeaning, ownPeopleBeside } from '../askChoices';
import { needFromQuestion } from '../bridgePicker';

/** 2907 (QA-029, §99.4): the helper's saved dentist is a button again. */
describe('the reader’s own people beside the model’s buttons', () => {
  const authored: AskChoice[] = [
    { label: 'კი, ვიცნობ', means: ChoiceMeaning.Yes },
    { label: 'არა, ვერ ვიცნობ', means: ChoiceMeaning.No },
    { label: 'მოგვიანებით', means: ChoiceMeaning.Later },
  ];

  it('puts her people first, then the model’s „no", then „later" — four at most', () => {
    expect(
      ownPeopleBeside(
        ['ნანა გელაშვილი', 'ლევან ექიმი', 'მესამე'],
        authored,
        'არა',
        'მოგვიანებით გიპასუხებ',
      ),
    ).toEqual([
      { label: 'ნანა გელაშვილი', means: ChoiceMeaning.Answer },
      { label: 'ლევან ექიმი', means: ChoiceMeaning.Answer },
      { label: 'არა, ვერ ვიცნობ', means: ChoiceMeaning.No },
      { label: 'მოგვიანებით გიპასუხებ', means: ChoiceMeaning.Later },
    ]);
  });

  it('uses the plain „no" when the model wrote none', () => {
    const noNo = authored.filter((c) => c.means !== ChoiceMeaning.No);
    expect(ownPeopleBeside(['ნანა'], noNo, 'არა', 'მოგვიანებით')).toEqual([
      { label: 'ნანა', means: ChoiceMeaning.Answer },
      { label: 'არა', means: ChoiceMeaning.No },
      { label: 'მოგვიანებით', means: ChoiceMeaning.Later },
    ]);
  });

  it('is built whether or not the model wrote buttons, never under an introduction', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain(
      'pickerNeed && !sameThread && askKindOf(safeQuestion) !== AskKind.Intro',
    );
    expect(asks).toContain(
      'ownPeopleBeside(picker.names, authored, declineChoice(language), laterChoice(language))',
    );
  });
});

describe('the need an instructed ask carries (46036)', () => {
  it('is the trade its question asks about', () => {
    expect(needFromQuestion('იცნობს თუ არა კარგ სტომატოლოგს?')).toEqual({ need: 'სტომატოლოგ' });
    expect(needFromQuestion('იცნობ სანდო ბუღალტერს?')).toEqual({ need: 'ბუღალტერ' });
    expect(needFromQuestion('Do you know a good dentist?')).toEqual({ need: 'dentist' });
    expect(needFromQuestion('Do you know of any plumber in Vake?')).toEqual({ need: 'plumber' });
  });

  it('is nothing when the question asks no trade', () => {
    expect(needFromQuestion('როდის გცალია?')).toBeUndefined();
    expect(needFromQuestion('გამაცნობ გიას?')).toBeUndefined();
  });

  it('is used when no search gave one', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain('const pickerNeed = bridgeNeed ?? needFromQuestion(safeQuestion);');
  });
});
