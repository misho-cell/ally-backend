import { instructionAddressee } from '../goalIntent';

/**
 * #961 (the tester's 1142, 37509): the tapped „გიას ვთხოვ ამ კვირაში შეხვედრის
 * დანიშვნას" names Gia before its verb, and the instruction was read as naming
 * nobody — so a plan card asked for a yes the tap had already given.
 */
describe('the person an instruction names', () => {
  it('is found right before the verb, in the dative a person takes there', () => {
    expect(instructionAddressee('გიას ვთხოვ ამ კვირაში შეხვედრის დანიშვნას')).toContain('გია');
    expect(instructionAddressee('ნინოს ჰკითხე კარგ ექიმზე')).toContain('ნინო');
  });

  it('is still found after the verb', () => {
    expect(instructionAddressee('ჰკითხე Netai Test 111-ს')).toBe('Netai Test 111-ს');
  });

  it('is nobody for a group, and the line before the verb still stays out (1101)', () => {
    expect(instructionAddressee('მჭირდება სანდო მძღოლი, ჰკითხე ჩემს ნაცნობებს')).toBe('');
  });
});
