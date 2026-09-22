import { approvalBelongsToThePlan, readPlanConsentScreen } from '../chat.service';

/**
 * Ticket 20 row 237 — a typed approval refused because the product dealt its
 * own card on top of the plan.
 *
 * The seat, 21 September 23:25:56: the plan card went up with „ვამტკიცებ /
 * შევცვალოთ", and in the same second, after it, „8 more updates are waiting"
 * with „Show them / Later". „go ahead" at 23:26:24 was refused; „ვამტკიცებ"
 * went through at 23:27:36. The guard was reading the newest card OF ANY KIND.
 *
 * The window now starts at the newest PLAN card. What still protects Ticket 19
 * G2 — where a tap on a draft's „კი, გააგზავნე" was recorded as approving a
 * three-person plan and wrote to two people the founder had not chosen — is
 * that a line which is EXACTLY THE LABEL of a card dealt after the plan is the
 * owner pressing that button, whatever the words say.
 *
 * Both halves matter and the second is the dangerous one, because „გააგზავნე"
 * is in the go-ahead list AND is the draft card's own button. If that check ran
 * after the approval scan instead of before it, G2 would be back.
 */
const PLAN_CARD = ['ვამტკიცებ', 'შევცვალოთ'];
const UPDATES_CARD = ['Show them', 'Later'];
const DRAFT_CARD = ['კი, გააგზავნე', 'შევცვალოთ ტექსტი'];

describe('a plan behind a card the product dealt afterwards', () => {
  it('the seat’s case: a typed go-ahead approves although the updates card came after', () => {
    expect(approvalBelongsToThePlan('go ahead', PLAN_CARD, ['go ahead'], UPDATES_CARD)).toBe(true);
  });

  it('the same in Georgian, which is what the founder types', () => {
    expect(
      approvalBelongsToThePlan('კარგი, გააკეთე', PLAN_CARD, ['კარგი, გააკეთე'], UPDATES_CARD),
    ).toBe(true);
  });

  it('a bare yes still approves with an updates card standing in front of the plan', () => {
    expect(approvalBelongsToThePlan('კი', PLAN_CARD, ['კი'], UPDATES_CARD)).toBe(true);
  });

  /**
   * G2 THROUGH THE NEW DOOR, and the reason the check is a label match rather
   * than „ignore the server's cards". „გააგზავნე" is a go-ahead word, so the
   * approval scan would say yes to it; it is also the draft card's own button.
   */
  it('a tap on a later card’s own button is that button, not an approval', () => {
    expect(
      approvalBelongsToThePlan('კი, გააგზავნე', PLAN_CARD, ['კი, გააგზავნე'], DRAFT_CARD),
    ).toBe(false);
  });

  it('matches the label whatever the spacing or case', () => {
    expect(
      approvalBelongsToThePlan('  Კი, გააგზავნე  ', PLAN_CARD, ['  Კი, გააგზავნე  '], DRAFT_CARD),
    ).toBe(false);
  });

  it('the intro-accept item’s label is an affirmative and still is not an approval', () => {
    const introCard = ['კი, გავიცნობ', 'არა, მადლობა', 'მოგვიანებით'];
    expect(approvalBelongsToThePlan('კი, გავიცნობ', PLAN_CARD, ['კი, გავიცნობ'], introCard)).toBe(
      false,
    );
  });

  /** Pressing another card's button and THEN saying yes is still a yes. */
  it('a later card answered first does not silence an approval that follows it', () => {
    expect(
      approvalBelongsToThePlan('go ahead', PLAN_CARD, ['Later', 'go ahead'], UPDATES_CARD),
    ).toBe(true);
  });

  it('a later card answered and nothing else is not an approval', () => {
    expect(approvalBelongsToThePlan('Later', PLAN_CARD, ['Later'], UPDATES_CARD)).toBe(false);
  });

  /**
   * The approve label itself must survive even if some later card happens to
   * carry the same word — the tap can only have been the plan's.
   */
  it('the plan’s own approve word is never mistaken for another card’s button', () => {
    expect(
      approvalBelongsToThePlan('ვამტკიცებ', PLAN_CARD, ['ვამტკიცებ'], ['Show them', 'Later']),
    ).toBe(true);
  });

  /**
   * Row 156's rule is unchanged by any of this: an approval still stands
   * until something after it takes it back.
   *
   * FOUND WHILE WRITING THIS FILE, and it is not row 237's: „შევცვალოთ" — the
   * plan card's own CHANGE button — does NOT take an approval back, because
   * TAKES_IT_BACK is a list of negations („არა", „მაგრამ", „but", „if") and a
   * request to change is not one. So „go ahead" then „შევცვალოთ" still reads as
   * approved. That may well be wrong, but it is older than tonight and it is
   * the seat's done-when to set, so it is written here rather than changed
   * quietly inside a fix for something else.
   */
  it('a real retraction after the approval still takes it back', () => {
    expect(
      approvalBelongsToThePlan(
        'არა, მოიცადე',
        PLAN_CARD,
        ['go ahead', 'არა, მოიცადე'],
        UPDATES_CARD,
      ),
    ).toBe(false);
  });

  /** With no later cards at all, nothing about the old behaviour changes. */
  it('behaves exactly as before when nothing was dealt after the plan', () => {
    expect(approvalBelongsToThePlan('go ahead', PLAN_CARD, ['go ahead'], [])).toBe(true);
    expect(approvalBelongsToThePlan('go ahead', PLAN_CARD, ['go ahead'])).toBe(true);
  });
});

/**
 * The half that was untested until a sabotage run found it: WHICH card the
 * owner is taken to be answering. Every test above hands the predicate its
 * arguments; these check the code that chooses them.
 */
describe('which card the owner is answering', () => {
  const card = (at: string, labels: string[]) => ({ at, labels });
  const said = (at: string, content: string) => ({ at, content });

  it('picks the plan card even when the product dealt one after it', () => {
    const screen = readPlanConsentScreen(
      [card('23:25:57', UPDATES_CARD), card('23:25:56', PLAN_CARD)],
      [said('23:26:24', 'go ahead')],
    );

    expect(screen.newestOfferedChoices).toEqual(PLAN_CARD);
    expect(screen.labelsDealtAfterTheCard).toEqual(UPDATES_CARD);
    expect(screen.ownerSaidSinceCard).toEqual(['go ahead']);
  });

  it('collects the labels of EVERY card dealt after the plan, not just the newest', () => {
    const screen = readPlanConsentScreen(
      [card('10:03', ['Later']), card('10:02', ['Show them']), card('10:01', PLAN_CARD)],
      [],
    );

    expect(screen.labelsDealtAfterTheCard).toEqual(['Later', 'Show them']);
  });

  it('falls back to the newest card when the thread holds no plan at all', () => {
    const screen = readPlanConsentScreen([card('10:02', UPDATES_CARD)], [said('10:03', 'კი')]);

    expect(screen.newestOfferedChoices).toEqual(UPDATES_CARD);
    expect(screen.labelsDealtAfterTheCard).toEqual([]);
  });

  it('the window starts at the PLAN card, so a line typed between the two is in it', () => {
    const screen = readPlanConsentScreen(
      [card('10:05', UPDATES_CARD), card('10:01', PLAN_CARD)],
      [said('09:59', 'before the plan'), said('10:03', 'go ahead')],
    );

    expect(screen.ownerSaidSinceCard).toEqual(['go ahead']);
    expect(screen.lastOwnerMessage).toBe('go ahead');
  });

  it('answers with nothing on a thread that has no cards', () => {
    const screen = readPlanConsentScreen([], [said('10:00', 'hello')]);

    expect(screen.newestOfferedChoices).toBeNull();
    expect(screen.ownerSaidSinceCard).toEqual([]);
    expect(screen.lastOwnerMessage).toBe('hello');
  });
});
