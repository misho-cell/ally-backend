import { contactInstructionIn } from '../instructionUnsent';

/**
 * The tester's 62615 (thread 55482): „ჩამომიწერე სამი სახელი სიად: ნინო, გიორგი,
 * ანა. მხოლოდ სია." was read as an order to write to someone, and the owner got
 * „კითხვა არ გაიგზავნა". „ჩამომიწერე" holds „მიწერე"; it writes something down
 * for the owner and reaches nobody.
 */
describe('a request to write something down', () => {
  it('is not an instruction to write to a contact', () => {
    expect(
      contactInstructionIn('ჩამომიწერე სამი სახელი სიად: ნინო, გიორგი, ანა. მხოლოდ სია.'),
    ).toBeNull();
    expect(contactInstructionIn('ჩამიწერე ეს სამი სახელი')).toBeNull();
    expect(contactInstructionIn('გადამიწერე ეს ტექსტი ნინოსთვის')).toBeNull();
  });

  it('leaves the real „write to" instructions as they were', () => {
    expect(contactInstructionIn('მიწერე ნინოს, იცნობს თუ არა ფოტოგრაფს')).not.toBeNull();
    expect(contactInstructionIn('მისწერე გიორგის და ჰკითხე')).not.toBeNull();
    expect(contactInstructionIn('ჰკითხე ანას, ხვალ თავისუფალია თუ არა')).not.toBeNull();
  });
});
