import { buildShownAnswersWakeEvent } from '../taskAsks.service';

/**
 * 3136 (the tester's 46235, Misho's yes, §102): after the helper named her own
 * saved contact, the owner's run asked her again for that person's surname or
 * number. The answer note now says the way is an introduction through her.
 */
describe('the answer note', () => {
  it('says not to ask the helper for a surname or number, and to offer an introduction', () => {
    const note = buildShownAnswersWakeEvent([
      { answer: 'ნინო სტომატოლოგი (კლინიკა ღიმილი)', fromName: 'სალომე', verbatim: false },
    ]);
    expect(note).toContain('მას მისი გვარი ან ნომერი ნუ ჰკითხავ');
    expect(note).toContain('მფლობელს შესთავაზე, რომ მან გააცნოს.');
  });
});
