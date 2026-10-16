import { contactInstructionIn } from '../instructionUnsent';

/**
 * The tester's 63100 (thread 55573): „უკვე მოგვარდა: თამარ ქავთარაძეს ვკითხე, მან
 * თიბისიში თავის ნაცნობს დაურეკა და სესხი დამიმტკიცეს. მადლობა." told what the
 * owner had already done. The server read „ვკითხე" as „ask her", forced a send,
 * and Tamar got a question about a loan that was already approved.
 */
describe('a report of what was already done', () => {
  it('is not an instruction to contact anybody', () => {
    expect(
      contactInstructionIn(
        'უკვე მოგვარდა: თამარ ქავთარაძეს ვკითხე, მან თიბისიში თავის ნაცნობს დაურეკა და სესხი დამიმტკიცეს. მადლობა.',
      ),
    ).toBeNull();
    expect(contactInstructionIn('ნინოს ვუთხარი და შეთანხმდნენ')).toBeNull();
    expect(contactInstructionIn('გიორგის ვთხოვე და დამეხმარა')).toBeNull();
    expect(contactInstructionIn('ანამ უთხრა თავის უფროსს')).toBeNull();
    expect(contactInstructionIn('ლევანმა სთხოვა ბანკს')).toBeNull();
    expect(contactInstructionIn('გიორგის ვთხოვე, ხვალ დამირეკავს')).toBeNull();
  });

  it('leaves the real instructions as they were', () => {
    expect(contactInstructionIn('ჰკითხე თამარს, იცნობს თუ არა ვინმეს თიბისიში')).not.toBeNull();
    expect(contactInstructionIn('კითხე ნინოს, ხვალ თავისუფალია?')).not.toBeNull();
    expect(contactInstructionIn('უთხარი გიორგის, რომ ხუთშაბათს შემიძლია')).not.toBeNull();
    expect(contactInstructionIn('სთხოვე ლევანს გაგვაცნოს')).not.toBeNull();
    expect(contactInstructionIn('თხოვე ანას დამიკავშირდეს')).not.toBeNull();
  });
});
