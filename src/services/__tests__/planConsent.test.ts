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

/**
 * Third pass, 16 September — found by checking what people have ACTUALLY typed
 * rather than what I imagined they type.
 *
 * Every approval in the live conversations table, all of them:
 *
 *   „დამტკიცებულია"                            × 7
 *   „დამტკიცებულია. დაიწყე გეგმის მიხედვით."   × 1
 *
 * The first is the button: a tap is stored as an ordinary user message, so the
 * button path and the typing path are the same path — which is also the answer
 * to the one thing the tester cannot test, because by the founder's rule they
 * never press approve.
 *
 * The second one my own second pass would have REFUSED. canonicalChoiceLabel
 * only folds an approve word to the label at two words or fewer, and the bare
 * affirmative list does not match a sentence. Tightening against „სააგენტო" had
 * taken „approved, start on the plan" with it: one instance in the whole
 * history, and the kind of regression nobody notices until a real person is
 * ignored.
 */
describe('Ticket 19 G2, third pass — every approval anyone has really typed', () => {
  const PLAN_CARD = ['დამტკიცებულია', 'შევცვალოთ'];

  it('the button, which is 7 of the 8 and the path nobody can test by hand', () => {
    expect(approvalBelongsToThePlan('დამტკიცებულია', PLAN_CARD)).toBe(true);
  });

  it('the 8th, a sentence that opens by approving', () => {
    expect(approvalBelongsToThePlan('დამტკიცებულია. დაიწყე გეგმის მიხედვით.', PLAN_CARD)).toBe(
      true,
    );
  });

  it.each([
    'დავამტკიცე, დაიწყე',
    'ვადასტურებ, მიდი',
    'approved, go ahead',
    'დადასტურებულია, გააგრძელე',
  ])('„%s" approves — an approve word leading the sentence is a yes', (said) => {
    expect(approvalBelongsToThePlan(said, PLAN_CARD)).toBe(true);
  });

  it.each([
    'დამტკიცებულია, მაგრამ ჯერ ნინიას არ მისწერო',
    'კი, ოღონდ მხოლოდ ერთ ადამიანს',
    'approved but not yet',
    'კი, თუ ლიკაც დაეთანხმება',
  ])('„%s" does NOT approve — it takes itself back', (said) => {
    expect(approvalBelongsToThePlan(said, PLAN_CARD)).toBe(false);
  });

  it('and the hole that started all this is still closed', () => {
    expect(approvalBelongsToThePlan('სააგენტო', PLAN_CARD)).toBe(false);
    expect(approvalBelongsToThePlan('ეკრანი 15 დიუიმიანია.', PLAN_CARD)).toBe(false);
  });
});

/**
 * Ticket 20 row 122, the founder's D292 — keep BOTH the button and the words.
 *
 * Ninia, testing live on 16 September, said yes in words twice and was sent to
 * find a button each time:
 *
 *   goal 3533, 10:36:49  „კარგი მიდი გააკეთე რაც შეგიძლია"  refused 10:36:53
 *   goal 3540, 11:27:19  „გაგზავნე რექვესთები"              refused 11:27:24
 *
 * A human assistant hears "go ahead, send them" as a yes. Yesterday's rule was
 * right about „სააგენტო" — a one-word ANSWER that sent a real ask — and too
 * narrow about everything else. This is the widening, with the refusals the
 * tester named held in place beside it.
 */
describe('Ticket 20 row 122 — a typed go-ahead approves', () => {
  const PLAN_CARD = ['დამტკიცებულია', 'შევცვალოთ'];

  it.each([
    'კარგი მიდი გააკეთე რაც შეგიძლია',
    'გაგზავნე რექვესთები',
    'მიდი, გაგზავნე',
    'დაიწყე',
    'კარგი, გააგრძელე',
    'go ahead',
  ])('„%s" approves', (said) => {
    expect(approvalBelongsToThePlan(said, PLAN_CARD)).toBe(true);
  });

  /** The three the seat says it will test, and they must all still refuse. */
  it.each([
    ['სააგენტო', 'a one-word answer to a question — the 15 Sep case'],
    ['ეკრანი 15 დიუიმიანია.', 'a detail'],
    ['Gega-ს არ მისწერო.', 'a correction that names an action'],
  ])('„%s" still approves nothing (%s)', (said) => {
    expect(approvalBelongsToThePlan(said, PLAN_CARD)).toBe(false);
  });

  it.each([
    ['მიდი, მაგრამ ჯერ ნინიას არ მისწერო', 'it takes itself back'],
    ['გაგზავნო?', 'it is a question'],
    ['ნუ გაგზავნი', 'it says the opposite'],
    ['გააკეთე ისე, რომ გეგას არ მისწერო და ჯერ ნინიას ჰკითხე', 'it carries content'],
  ])('„%s" does not approve (%s)', (said) => {
    expect(approvalBelongsToThePlan(said, PLAN_CARD)).toBe(false);
  });

  it('a go-ahead with NO plan card on screen still approves nothing', () => {
    expect(approvalBelongsToThePlan('მიდი, გაგზავნე', ['კი, გააგზავნე', 'შევცვალოთ'])).toBe(false);
  });
});

/**
 * Ticket 20 row 131 — the go-ahead words were matched as substrings.
 *
 * Found on 16 September by sweeping src/ for the defect family row 116 turned
 * up in privacyScrub, where „tel" matched inside „hotel". This is the same
 * mistake in the worst place in the codebase: the path that decides whether a
 * plan was approved, and an approval puts real asks on real people's phones.
 *
 * Georgian inflects on the END of a word, so every imperative in the go-ahead
 * list is a prefix of an ordinary descriptive verb:
 *
 *   მიდი  (go!)      is inside  მიდის    (he is going)
 *   გააკეთე (do it!) is inside  გააკეთებს (he will do it)
 *   დაიწყე (start!)  is inside  დაიწყება  (it starts)
 *
 * All four sentences below APPROVED A PLAN against the code as row 122 shipped
 * it this morning. Not one of them is addressed to the assistant at all.
 */
describe('row 131 — a description of somebody going is not permission to go', () => {
  const PLAN_CARD = ['დამტკიცებულია', 'შევცვალოთ'];

  it.each([
    ['ის მიდის სახლში', 'he is going home'],
    ['გიორგი მიდის ხვალ', 'Giorgi is going tomorrow'],
    ['ის გააკეთებს ამას', 'he will do it'],
    ['დაიწყება ხვალ', 'it starts tomorrow'],
    ['შეხვედრა დაიწყება 5-ზე', 'the meeting starts at five'],
  ])('„%s" approves nothing (%s)', (said) => {
    expect(approvalBelongsToThePlan(said, PLAN_CARD)).toBe(false);
  });

  /** Everything row 122 widened the rule FOR has to keep working. */
  it.each([
    'მიდი',
    'მიდი, გაგზავნე',
    'კარგი მიდი გააკეთე რაც შეგიძლია',
    'გაგზავნე რექვესთები',
    'დაიწყე',
    'კარგი, გააგრძელე',
  ])('„%s" still approves', (said) => {
    expect(approvalBelongsToThePlan(said, PLAN_CARD)).toBe(true);
  });

  /**
   * The multi-word entries stay substring tests on purpose: a phrase cannot
   * land inside a single word, and exact tokens would lose „go ahead," to its
   * own comma.
   */
  it.each(['go ahead', 'go ahead, send them', 'send it'])(
    'the English phrase „%s" approves',
    (s) => {
      expect(approvalBelongsToThePlan(s, PLAN_CARD)).toBe(true);
    },
  );

  it('and the refusals every earlier pass won are all still refusals', () => {
    for (const said of [
      'სააგენტო',
      'ეკრანი 15 დიუიმიანია.',
      'Gega-ს არ მისწერო.',
      'მიდი, მაგრამ ჯერ ნინიას არ მისწერო',
      'გაგზავნო?',
      'ნუ გაგზავნი',
    ]) {
      expect(approvalBelongsToThePlan(said, PLAN_CARD)).toBe(false);
    }
  });
});

/**
 * Ticket 20 row 131, second half — the negation rule keyed on punctuation.
 *
 * Its own comment claimed a bare „არ" and „ნუ" were „matched as a whole word".
 * They were not: the rule treated only WHITESPACE as a boundary and looked for
 * „არა" followed by a literal comma. Georgian punctuation is neither, and all
 * five of these approved a plan on the deployed code.
 *
 * These are worse than the first half. Each one is a direct answer to the
 * assistant in which the owner said NO.
 */
describe('row 131 second half — „Go. No." is not a yes', () => {
  const PLAN_CARD = ['დამტკიცებულია', 'შევცვალოთ'];

  it.each([
    ['მიდი. არა.', 'a full stop, not a comma'],
    ['მიდი, არა!', 'an exclamation mark'],
    ['გაგზავნე? არა', 'the no comes after the question'],
    ['მიდი (არა)', 'brackets'],
    ['დაიწყე — არა', 'a dash'],
    ['მიდი, არ გააკეთო.', 'a bare არ followed by a word'],
    ['გააგრძელე. ნუ!', 'ნუ against a boundary that is not a space'],
  ])('„%s" approves nothing (%s)', (said) => {
    expect(approvalBelongsToThePlan(said, PLAN_CARD)).toBe(false);
  });

  /**
   * The other direction, which is the one that costs a real person. This rule
   * REFUSES, so over-matching sends somebody back to hunt for a button — the
   * complaint row 122 exists to fix. A word that merely CONTAINS a negation is
   * not a negation.
   */
  it.each([
    ['მიდი, არაფერი გვჭირდება', 'არაფერი — „nothing", not „no"'],
    ['გააგრძელე, არაუშავს', 'არაუშავს — „never mind"'],
  ])('„%s" still approves (%s)', (said) => {
    expect(approvalBelongsToThePlan(said, PLAN_CARD)).toBe(true);
  });

  it('an inflected მაგრამ still takes it back — a refusal may over-reach, safely', () => {
    expect(approvalBelongsToThePlan('მიდი, მაგრამაც ჯერ არა', PLAN_CARD)).toBe(false);
  });
});
