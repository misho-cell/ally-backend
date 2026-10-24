import { DISPLAY_NAME, LATEST_OWN_LABEL } from '../searchByTag';
import { REVERSE_TIE_SOURCE } from '../../reverseTieSource';

/**
 * Tester 75643 (real account, 24 Oct): the owner's Netai said „you have him
 * saved as …" about a person the owner never saved. The row was a reverse tie
 * (the other person saved the owner), carrying the other person's registered
 * name. A reverse-tie row is never the owner's own label.
 */
describe("the owner's own label", () => {
  it('leaves reverse-tie rows out', () => {
    expect(REVERSE_TIE_SOURCE).toBe('reverse_tie');
    expect(LATEST_OWN_LABEL).toContain("ua.source IS DISTINCT FROM 'reverse_tie'");
  });

  it('so the shown name falls back to the registered name, not to „saved as"', () => {
    expect(DISPLAY_NAME).toContain(LATEST_OWN_LABEL);
    expect(DISPLAY_NAME).toContain('MAX(u.name)');
  });
});
