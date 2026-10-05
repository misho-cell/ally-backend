import { looksLikeGoalRequest, statesANeed } from '../goalIntent';
import { isSmallTalk } from '../smallTalk';

/**
 * The prompt seat's 39073 (thread 39637): „მადლობა, ძალიან დამეხმარე" as the
 * first message opened goal 17920, searched the phonebook for „ძალიან" and
 * asked whether the matter was settled. „დამეხმარე" is also „you helped me".
 */
describe('a thank-you is not a goal', () => {
  it('reads „you helped me" in a thank-you as no need', () => {
    expect(statesANeed('მადლობა, ძალიან დამეხმარე')).toBe(false);
    expect(looksLikeGoalRequest('მადლობა, ძალიან დამეხმარე')).toBe(false);
    expect(statesANeed('გმადლობ, დიდად დამეხმარე!')).toBe(false);
  });

  it('keeps „help me" a need when nobody is thanked', () => {
    expect(statesANeed('დამეხმარე ბუღალტრის პოვნაში')).toBe(true);
  });

  it('keeps another need stated in the same thank-you line', () => {
    expect(statesANeed('მადლობა, დამეხმარე. ახლა ფოტოგრაფი მჭირდება')).toBe(true);
    expect(statesANeed('Thanks! I need a dentist in Tbilisi')).toBe(true);
  });
});

describe('a thank-you is small talk', () => {
  it('answers a thank-you with praise as small talk (no tools, nothing waiting after it)', () => {
    expect(isSmallTalk('მადლობა, ძალიან დამეხმარე')).toBe(true);
    expect(isSmallTalk('Thanks, that was really helpful!')).toBe(true);
  });

  it('keeps a thank-you that asks for something as work', () => {
    expect(isSmallTalk('მადლობა, ახლა ბუღალტერი მჭირდება')).toBe(false);
    expect(isSmallTalk('მადლობა, ნინოს ნომერი ხომ არ გაქვს?')).toBe(false);
  });
});
