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

  // This test used to assert that „შევცვალოთ" APPROVES when a plan card is on
  // screen — „let us change it" recorded as a yes. That is not a slip in the
  // test; it is the first rule written down honestly. The rule accepted
  // anything at all once the newest card was a plan card, and a test that
  // states a rule faithfully will state a wrong rule just as faithfully.
  // The second pass below is what closed it.
  it('a request to CHANGE the plan is never an approval of it', () => {
    expect(approvalBelongsToThePlan('შევცვალოთ', PLAN_BUTTONS)).toBe(false);
    expect(approvalBelongsToThePlan('შევცვალოთ', DRAFT_BUTTONS)).toBe(false);
  });
});

/**
 * Second pass, 15 September 21:04 — the first rule was not enough, and a real
 * ask went out because of it.
 *
 * Goal 3433, thread 15511, account 501, all UTC, read from the new tool log:
 *
 *   20:44:39  propose_task_plan, then present_choices
 *             [„დამტკიცებულია", „შევცვალოთ"]. The plan card ALSO repeated an
 *             earlier clarifying question (what kind of partner).
 *   20:46:39  the tester typed one word: „სააგენტო". No button.
 *   20:46:45  approve_task_plan confirmed=true; timeline „v1 — მფლობელმა".
 *   20:47:30  ask_contact × 5. Ask 1816 delivered to a real person.
 *
 * The first rule accepted a yes whenever the newest thing offering buttons was
 * a plan card. At 20:46:39 it was. But „სააგენტო" answers the question, not the
 * plan — the rule read the SERVER'S last move and called it the owner's.
 *
 * The founder let the ask stand and ruled the mechanism out.
 */
describe('Ticket 19 G2, second pass — the words have to carry the yes', () => {
  const PLAN_CARD = ['დამტკიცებულია', 'შევცვალოთ'];

  it('the word that actually went out does NOT approve', () => {
    expect(approvalBelongsToThePlan('სააგენტო', PLAN_CARD)).toBe(false);
  });

  it.each([
    ['თანადამფუძნებელი', 'another answer to the same clarifying question'],
    ['ფრილანსერი', 'a third one'],
    ['ორივე', 'a choice word that is not a yes'],
    ['რაც შეიძლება სწრაფად', 'a detail typed under the card'],
  ])('%s does not approve (%s)', (typed) => {
    expect(approvalBelongsToThePlan(typed, PLAN_CARD)).toBe(false);
  });

  it('the approve button still approves — that is what a tap sends', () => {
    expect(approvalBelongsToThePlan('დამტკიცებულია', PLAN_CARD)).toBe(true);
  });

  it.each(['კი', 'ki', 'ხო', 'დიახ', 'კარგი', 'მიდი', 'yes', 'ok', 'დაამტკიცე'])(
    'a bare „%s" under a plan card still approves — fewer interruptions, not more',
    (yes) => {
      expect(approvalBelongsToThePlan(yes, PLAN_CARD)).toBe(true);
    },
  );

  it('a plain yes with NO plan card on screen does not approve', () => {
    expect(approvalBelongsToThePlan('კი', ['კი, გააგზავნე', 'შევცვალოთ'])).toBe(false);
  });

  it('a yes with a condition attached is not a bare yes', () => {
    expect(approvalBelongsToThePlan('კი, მაგრამ ჯერ ნინიას არ მისწერო', PLAN_CARD)).toBe(false);
  });

  it('silence does not approve', () => {
    expect(approvalBelongsToThePlan(null, PLAN_CARD)).toBe(false);
    expect(approvalBelongsToThePlan('   ', PLAN_CARD)).toBe(false);
  });

  it('the approve label approves even with no card recorded — a tap is a tap', () => {
    expect(approvalBelongsToThePlan('დამტკიცებულია', null)).toBe(true);
  });
});
