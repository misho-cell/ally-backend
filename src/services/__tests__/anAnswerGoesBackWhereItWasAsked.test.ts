import { askedFromAnotherGoalsThread } from '../chat.service';

/**
 * The tester's 1056 (threads 31059 / 31089): a question asked in a new
 * conversation was filed under an old goal from another conversation, and the
 * answer woke the old one. Such an ask is refused, with the way through.
 */
describe('which goal a question may be filed under', () => {
  it('refuses a goal whose conversation is another one', () => {
    expect(askedFromAnotherGoalsThread(31059, 31089)).toBe(true);
  });

  it('allows the goal of this conversation, and the connector that has none', () => {
    expect(askedFromAnotherGoalsThread(31089, 31089)).toBe(false);
    expect(askedFromAnotherGoalsThread(31059, undefined)).toBe(false);
    expect(askedFromAnotherGoalsThread(null, 31089)).toBe(false);
  });
});
