import { buildShownAnswersWakeEvent } from '../taskAsks.service';

/**
 * 3136 (the tester's 46235, Misho's yes, §102): after the helper named her own
 * saved contact, the owner's run asked her again for that person's surname or
 * number. The answer note now says the way is an introduction through her.
 */
describe('the answer note', () => {
  it('says not to ask the helper for a surname or number, and to follow the plan’s introduction rule', () => {
    const note = buildShownAnswersWakeEvent([
      { answer: 'ნინო სტომატოლოგი (კლინიკა ღიმილი)', fromName: 'სალომე', verbatim: false },
    ]);
    expect(note).toContain('მას მისი გვარი ან ნომერი ნუ ჰკითხავ');
    // The tester's battery (6 Nov): the plan's on_named rule decides, not an offer.
    expect(note).toContain('გზა მასთან გაცნობაა ამ ადამიანის გავლით');
    expect(note).toContain('on_named: introduce — ახლავე request_introduction');
    expect(note).not.toContain('შესთავაზე, რომ მან გააცნოს');
  });
});

describe('an agreement on the answers card (battery 6 Nov, C1, C2, C7)', () => {
  it('follows the plan’s on_named rule, never an offer, and never a task for the owner', () => {
    const event = buildShownAnswersWakeEvent([
      { answer: 'კი, შემიძლია დაგაკავშირო.', fromName: 'ანა', verbatim: false },
    ]);
    expect(event).toContain('on_named: introduce — ახლავე request_introduction');
    expect(event).not.toContain('ერთი ღილაკით შესთავაზე');
    expect(event).not.toContain('რა უნდა გააკეთოს მფლობელმა');
  });
});
