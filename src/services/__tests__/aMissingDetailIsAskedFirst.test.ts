import { asksTheOwnerForADetail, bookingWithoutAWhen } from '../replyGuards';

/**
 * D795 (Misho's yes, 17 Oct), the tester's 64520: „სთხოვე გიორგის, მაგიდა
 * დამიჯავშნოს" was sent at once; the run's question for the place and day was
 * taken for a dropped send.
 */
describe('a reply asking the owner for the missing detail', () => {
  it('is that question, in Georgian and English', () => {
    expect(asksTheOwnerForADetail('კარგი. რომელ რესტორანში და რა დღეს დაგიჯავშნოს?')).toBe(true);
    expect(asksTheOwnerForADetail('Sure. Which doctor, and when would suit you?')).toBe(true);
    expect(asksTheOwnerForADetail('სად და როდის?')).toBe(true);
  });

  it('is not the owner’s question written back, a promise, or a statement', () => {
    expect(asksTheOwnerForADetail('გიორგი, იცნობ კარგ ექიმს?')).toBe(false);
    expect(asksTheOwnerForADetail('გიორგის ვკითხავ.')).toBe(false);
    expect(asksTheOwnerForADetail('When he answers, I will tell you.')).toBe(false);
  });
});

describe('a booking the owner gave no day or time for', () => {
  it('goes back to the owner first', () => {
    expect(bookingWithoutAWhen('ქეთის სთხოვე, ექიმთან ჩამწეროს')).toBe(true);
    expect(bookingWithoutAWhen('სთხოვე გიორგი წიკლაურს, მაგიდა დამიჯავშნოს.')).toBe(true);
    expect(bookingWithoutAWhen('Ask Nino to book me a table')).toBe(true);
  });

  it('is sent when the owner said when, or when it is no booking', () => {
    expect(bookingWithoutAWhen('სთხოვე გიორგის, ხვალ 8 საათზე მაგიდა დამიჯავშნოს')).toBe(false);
    expect(bookingWithoutAWhen('Ask Nino to book me a table for Saturday')).toBe(false);
    expect(bookingWithoutAWhen('ჰკითხე თამარს, შაბათს თავისუფალია თუ არა')).toBe(false);
  });
});
