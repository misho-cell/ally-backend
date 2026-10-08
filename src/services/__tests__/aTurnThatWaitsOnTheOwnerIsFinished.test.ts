import { isCliffhangerReply } from '../replyGuards';

/**
 * The tester's 45676 (conv 44256): the answer ended „მომწერე ერთი სახელი … და
 * ზუსტად შევამოწმებ", the guard read it as an announcement, and the nudge made
 * the run say the same thing again in a second block.
 */
describe('a turn that waits on the owner', () => {
  it('is finished when its last sentence asks the owner for something', () => {
    expect(
      isCliffhangerReply(
        'იურისტად შენახული ვერავინ ვიპოვე.\n\nმომწერე ერთი სახელი, ვინც სავარაუდოდ იურისტია, და ზუსტად შევამოწმებ.',
      ),
    ).toBe(false);
    expect(
      isCliffhangerReply('Nobody is saved as a lawyer. Send me a name and I will check.'),
    ).toBe(false);
    expect(isCliffhangerReply('თუ გახსოვს მისი გვარი, მოვძებნი.')).toBe(false);
  });

  it('is still a cliffhanger when the work is only announced', () => {
    expect(isCliffhangerReply('კონტაქტებში ვერავინ ვიპოვე. ახლა მეორე წრეში მოვძებნი.')).toBe(true);
    expect(isCliffhangerReply('ვნახოთ, თუ ვინმე იცნობს — ახლავე შევამოწმებ')).toBe(true);
    expect(isCliffhangerReply('Let me check your contacts')).toBe(true);
  });

  it('keeps the earlier rule only for the last sentence', () => {
    // An earlier request to the owner does not excuse a closing announcement.
    expect(isCliffhangerReply('მომწერე, თუ რამე შეიცვლება. ახლა კი მოვძებნი.')).toBe(true);
  });
});
