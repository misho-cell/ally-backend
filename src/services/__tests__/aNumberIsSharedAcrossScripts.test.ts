import { ownerLineSharesNumber, ownerLinesShareNumber } from '../shareNumber.service';

/**
 * The tester's 39604 (#991): „Gia Dantisti" saved in Latin letters, and
 * „გაუგზავნე ლევანს გია დანტისტის ნომერი" typed in Georgian, was refused
 * three times — then the yes to Netai's own question was refused too.
 */
describe('a number shared across scripts', () => {
  it('finds a Latin-saved name in a Georgian instruction', () => {
    expect(
      ownerLineSharesNumber(
        'გია დანტისტს ვურჩევ. გაუგზავნე ლევანს გია დანტისტის ნომერი.',
        'Gia Dantisti',
      ),
    ).toBe(true);
    expect(ownerLineSharesNumber('გაუგზავნე დათოს ნომერი', 'Dato Beridze')).toBe(true);
  });

  it('finds a Georgian-saved name in a Latin instruction', () => {
    expect(ownerLineSharesNumber("send him Nino's number", 'ნინო ბერიძე')).toBe(true);
  });

  it('still needs a number word and the right name', () => {
    expect(ownerLineSharesNumber('გია დანტისტს ვურჩევ', 'Gia Dantisti')).toBe(false);
    expect(ownerLineSharesNumber('გაუგზავნე ნინოს ნომერი', 'Gia Dantisti')).toBe(false);
  });

  it('takes a yes to Netai’s own question when the line before asked for that number', () => {
    expect(
      ownerLinesShareNumber(['კი', 'გაუგზავნე ლევანს გია დანტისტის ნომერი'], 'Gia Dantisti'),
    ).toBe(true);
  });

  it('never takes a bare yes on its own', () => {
    expect(ownerLinesShareNumber(['კი', 'გია კარგი ექიმია'], 'Gia Dantisti')).toBe(false);
    expect(ownerLinesShareNumber(['კი'], 'Gia Dantisti')).toBe(false);
  });
});
