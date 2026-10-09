import { approvalBelongsToThePlan } from '../chat.service';

/**
 * Giorgi, 2 October (G-007, team task #331): the plan was on screen with its
 * buttons; he asked a question instead, the assistant answered and asked
 * „shall I go ahead and contact the four?", and he typed „კი, დაუკავშირდი".
 * The model called approve_task_plan and the wall refused it, so he was told
 * to press „ვამტკიცებ". His word: his typed yes should have been enough.
 */
const PLAN_CARD = ['ვამტკიცებ', 'შევცვალოთ'];
const QUESTION = 'რამდენ ხანში მიპასუხებენ?';

const scan = (lines: readonly string[]): boolean =>
  approvalBelongsToThePlan(lines[lines.length - 1] ?? null, PLAN_CARD, lines);

describe('a typed yes to „shall I go ahead?"', () => {
  it('approves after a question and its answer came between', () => {
    expect(scan([QUESTION, 'კი, დაუკავშირდი'])).toBe(true);
  });

  it('approves in the other words people use for it', () => {
    for (const said of ['კი, მისწერე', 'დიახ, მიწერე მათ', 'ok, ask them', 'yes, contact them']) {
      expect(scan([QUESTION, said])).toBe(true);
    }
  });

  it('approves „ოკ", „ოk" and „დიახ, გაუგზავნე" (3533, 2 of 2 each)', () => {
    for (const said of ['ოკ', 'ოk', 'ოკ.', 'დიახ, გაუგზავნე']) {
      expect(scan([said])).toBe(true);
    }
  });

  it('does not take „ოკ" for a yes when no plan card is on screen', () => {
    expect(approvalBelongsToThePlan('ოკ', ['კი, გააგზავნე', 'არა'], ['ოკ'])).toBe(false);
  });

  it('still refuses a yes that takes itself back', () => {
    expect(scan([QUESTION, 'კი, დაუკავშირდი, მაგრამ ნინიას არა'])).toBe(false);
    expect(scan([QUESTION, 'კი, დაუკავშირდი', 'შევცვალოთ'])).toBe(false);
  });

  it('still refuses it as a question', () => {
    expect(scan([QUESTION, 'დაუკავშირდი?'])).toBe(false);
  });

  it('does not take an acknowledgement for an approval', () => {
    expect(scan([QUESTION, 'კი, ვიცი რომ ასეა'])).toBe(false);
  });

  it('counts only while a plan card is what is being answered (ticket 19 G2)', () => {
    const DRAFT_CARD = ['კი, გააგზავნე', 'არა'];
    expect(approvalBelongsToThePlan('კი, დაუკავშირდი', DRAFT_CARD, ['კი, დაუკავშირდი'])).toBe(
      false,
    );
  });

  it('refuses a long sentence that only mentions contacting', () => {
    expect(
      scan([QUESTION, 'მე თვითონ დაუკავშირდი ხვალ დილით ყველას და მერე შენ მოგწერ რა გავიგე']),
    ).toBe(false);
  });
});
