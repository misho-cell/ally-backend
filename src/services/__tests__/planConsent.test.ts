/**
 * Ticket 19 G2 — the yes that belonged to a different message.
 *
 * Thread 15380, 15 September, read from the live rows rather than the report:
 *
 *   17:23:22  the plan, v1, three people   buttons: დამტკიცებულია / შევცვალოთ
 *   17:59:38  a draft of ONE message       buttons: კი, გააგზავნე / შევცვალოთ
 *   18:00:17  the founder taps „კი, გააგზავნე"
 *   18:00:19  the timeline records plan v1 approved, „მფლობელმა"
 *   18:01:03  the day-one turn, reading that approval, writes to the two people
 *             he had NOT chosen
 *
 * He picked one person and one message. The gate that existed asked the MODEL
 * whether the user had said yes — and he had, to a draft. A flag cannot tell
 * those apart because it is the same flag either way.
 */
import { approvalBelongsToThePlan } from '../chat.service';

const PLAN_BUTTONS = ['დამტკიცებულია', 'შევცვალოთ'];
const DRAFT_BUTTONS = ['კი, გააგზავნე', 'შევცვალოთ'];
const ROUTE_BUTTONS = [
  'პირდაპირ ნინიას Netai-ით',
  'ქეთი კიღურაძის გავლით',
  'გიორგი აბრამიშვილის გავლით',
];

describe('whose yes it was', () => {
  it('refuses the exact tap that approved a three-person plan', () => {
    expect(approvalBelongsToThePlan('კი, გააგზავნე', DRAFT_BUTTONS)).toBe(false);
  });

  it('refuses a yes under a question about the route', () => {
    // 17:59:29, the message before it. Choosing a road is not approving a plan.
    expect(approvalBelongsToThePlan('პირდაპირ ნინიას Netai-ით', ROUTE_BUTTONS)).toBe(false);
  });

  it('accepts the plan card’s own button', () => {
    expect(approvalBelongsToThePlan('დამტკიცებულია', PLAN_BUTTONS)).toBe(true);
  });

  it('accepts a bare yes while the plan card is the newest thing on screen', () => {
    // This one matters as much as the refusals. The founder has asked to be
    // interrupted LESS (G3), so a „კი" under a plan must keep working — the
    // fix is about which message the yes belongs to, not about adding a tap.
    expect(approvalBelongsToThePlan('კი', PLAN_BUTTONS)).toBe(true);
    expect(approvalBelongsToThePlan('ok', PLAN_BUTTONS)).toBe(true);
  });

  it('accepts the owner’s own approving words even with no buttons anywhere', () => {
    // He typed „დამტკიცებულია" by hand on 15 September when the buttons did
    // not render (G1). That must still count.
    expect(approvalBelongsToThePlan('დამტკიცებულია', null)).toBe(true);
    expect(approvalBelongsToThePlan('ვამტკიცებ', [])).toBe(true);
    expect(approvalBelongsToThePlan('approve', DRAFT_BUTTONS)).toBe(true);
  });

  it('refuses when nothing on the screen and nothing said points at a plan', () => {
    expect(approvalBelongsToThePlan(null, null)).toBe(false);
    expect(approvalBelongsToThePlan('გააგზავნე', null)).toBe(false);
    expect(approvalBelongsToThePlan('კი', null)).toBe(false);
  });

  it('is not fooled by a change request that starts with the same letters', () => {
    expect(approvalBelongsToThePlan('შევცვალოთ', PLAN_BUTTONS)).toBe(true);
    // ...because the plan card IS on screen. Without it, a change is not a yes.
    expect(approvalBelongsToThePlan('შევცვალოთ', DRAFT_BUTTONS)).toBe(false);
  });
});
