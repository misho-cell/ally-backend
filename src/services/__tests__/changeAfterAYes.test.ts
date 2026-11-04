import { approvalBelongsToThePlan } from '../chat.service';

/**
 * „შევცვალოთ" after a yes — the plan card's own third button, which until
 * today left the approval standing.
 *
 * Found on the way through row 237 and written down instead of being quietly
 * fixed inside somebody else's correction: `TAKES_IT_BACK` is a list of
 * NEGATIONS („არა", „მაგრამ", „but", „if"), and a request to change the plan
 * is not a negation. It is a yes to something that no longer exists. So „go
 * ahead" followed by „შევცვალოთ" read as approved — and an approved plan puts
 * real asks on real people's phones.
 *
 * The seat decided it: a change request withdraws the yes.
 *
 * WHAT IS HELD HERE IS THE GUARD AND ONLY THE GUARD — nothing leaves. What the
 * product then DOES (re-propose as v+1, and name the asks already out as out)
 * is the other half of that row and is not built.
 */
const PLAN_CARD = ['ვამტკიცებ', 'შევცვალოთ'];

const scan = (lines: readonly string[]): boolean =>
  approvalBelongsToThePlan(lines[lines.length - 1] ?? null, PLAN_CARD, lines);

describe('a change asked for after a yes takes the yes back', () => {
  /**
   * THE HOLE THE FIX WALKED INTO, and it is older than this row.
   *
   * The multi-line scan found the yes in a line and then read everything AFTER
   * it. „დამტკიცებულია, ოღონდ..." („approved, only...") has nothing after it,
   * so it approved — while the SAME sentence arriving as a single message was
   * refused, because that path checks the line itself. One sentence, two
   * answers, decided by how many lines the owner had typed.
   */

  it('a later line can still carry the yes after a withdrawn one', () => {
    expect(scan(['დამტკიცებულია, მაგრამ მაცადე', 'კარგი, გააგზავნე'])).toBe(true);
  });

  it('a change asked for BEFORE the yes does not undo the yes that follows it', () => {
    expect(scan(['შევცვალოთ', 'ახლა კი, გააგზავნე'])).toBe(true);
  });
});

/**
 * The other direction, which is the one that costs a real person a real tap.
 *
 * Row 156 is the warning: an approval was refused three times because a short
 * „ok" typed after it was read as erasing it. A change list that is too wide
 * does the same thing with different words, so what it must NOT catch is
 * written down as plainly as what it must.
 */
describe('and it does not eat an approval that merely mentions a change', () => {
  it('approving a change is an approval, not a request for one', () => {
    // The noun („ცვლილება", „the change") is deliberately not in the list.
    expect(scan(['დაამტკიცე ცვლილება'])).toBe(true);
    expect(scan(['go ahead with the change'])).toBe(true);
  });

  it('row 156 still holds: agreeing with your own yes is not withdrawing it', () => {
    expect(scan(['დამტკიცებულია', 'ok'])).toBe(true);
  });

  it('a plain approval is still a plain approval', () => {
    expect(scan(['ვამტკიცებ'])).toBe(true);
    expect(scan(['დამტკიცებულია. დაიწყე გეგმის მიხედვით.'])).toBe(true);
  });
});

/**
 * Ticket 19 G2 is untouched — the guard that stops a tap on a DRAFT card being
 * recorded as approving a three-person plan. It is asserted here because this
 * change edits the same scan, and G2 is the failure that wrote to two people
 * the founder had not chosen.
 */
describe('the draft-card guard is where it was', () => {
  it('a press of a later card’s own button is not an answer to the plan', () => {
    expect(
      approvalBelongsToThePlan(
        'გააგზავნე',
        PLAN_CARD,
        ['გააგზავნე'],
        ['გააგზავნე', 'შევცვალოთ ტექსტი'],
      ),
    ).toBe(false);
  });
});
