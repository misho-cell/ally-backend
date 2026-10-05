import { ownerLinesShareNumber } from '../shareNumber.service';

/**
 * Tester 39832 (#1519): two contacts shared one name, Netai offered both, the
 * helper tapped one — and was asked again, her „კი" refused, and told to retype
 * the full sentence. Her first typed instruction is the yes (D316/D625).
 */
const INSTRUCTION = 'გაუგზავნე ლევანს დათოს ნომერი';
const ALIAS = 'Dato Karada';

describe('a pick carries the instruction before it', () => {
  it('takes the tap on the contact', () => {
    expect(ownerLinesShareNumber(['Dato Karada', INSTRUCTION], ALIAS)).toBe(true);
  });

  it('takes an ordinal tap', () => {
    expect(ownerLinesShareNumber(['მეორე', INSTRUCTION], ALIAS)).toBe(true);
  });

  it('takes the yes to the re-ask after the tap', () => {
    expect(ownerLinesShareNumber(['კი', 'Dato Karada', INSTRUCTION], ALIAS)).toBe(true);
  });

  it('never passes a line that takes it back', () => {
    expect(ownerLinesShareNumber(['არა, მოიცა', 'Dato Karada', INSTRUCTION], ALIAS)).toBe(false);
    expect(ownerLinesShareNumber(['Dato Karada არ გაუგზავნო', INSTRUCTION], ALIAS)).toBe(false);
  });

  it('never passes a new message between', () => {
    expect(ownerLinesShareNumber(['კი', 'რა ამინდია ხვალ?', INSTRUCTION], ALIAS)).toBe(false);
  });

  it('never passes a pick with no instruction behind it', () => {
    expect(ownerLinesShareNumber(['კი', 'Dato Karada'], ALIAS)).toBe(false);
  });
});

describe('the owner’s word rides with the number (#1553)', () => {
  const { withTheOwnersWord } = jest.requireActual('../shareNumber.service');

  it('puts the note on its own line above the name and number', () => {
    expect(withTheOwnersWord(' კარგი   ხელოსანია ', 'Dato: n')).toBe('კარგი ხელოსანია\nDato: n');
  });

  it('sends the name and number alone when there is no note', () => {
    expect(withTheOwnersWord('  ', 'Dato: n')).toBe('Dato: n');
  });
});
