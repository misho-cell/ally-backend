import { aLookedAgainLineTellsSomething, FRESH_ANSWER_MS } from '../quietSystemRun';

/** #1489: „searched again, nothing new yet" a minute after the first answer is noise. */
describe('the looked-again line', () => {
  const now = new Date('2026-10-05T21:00:00Z');

  it('is not written a minute or two after an answer', () => {
    expect(aLookedAgainLineTellsSomething(new Date('2026-10-05T20:58:30Z'), now)).toBe(false);
  });

  it('is written for the 30-minute run and scheduled checks', () => {
    expect(aLookedAgainLineTellsSomething(new Date('2026-10-05T20:30:00Z'), now)).toBe(true);
    expect(aLookedAgainLineTellsSomething(new Date(now.getTime() - FRESH_ANSWER_MS), now)).toBe(
      true,
    );
  });

  it('is written when the conversation has no answer yet', () => {
    expect(aLookedAgainLineTellsSomething(null, now)).toBe(true);
  });
});
