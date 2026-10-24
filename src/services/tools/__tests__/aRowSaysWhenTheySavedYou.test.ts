import { ONLY_REVERSE_TIE, THEY_SAVED_YOU_NOTE, theySavedYou } from '../searchByTag';

/**
 * Tester 75675 (Tornike's connector, 24 Oct): a reverse-tie row carried the
 * other person's registered name, and the connector said „saved by the owner
 * as G Baso". Misho (24 Oct): the row says the person saved the owner.
 */
describe('a row the owner never saved', () => {
  it('is marked when the owner’s only row for the number is a reverse tie', () => {
    expect(ONLY_REVERSE_TIE).toContain("ua.source = 'reverse_tie'");
    expect(theySavedYou({ only_reverse_tie: true })).toEqual({
      they_saved_you: true,
      they_saved_you_note: THEY_SAVED_YOU_NOTE,
    });
  });

  it('carries nothing on the owner’s own rows', () => {
    expect(theySavedYou({ only_reverse_tie: false })).toEqual({});
    expect(theySavedYou({})).toEqual({});
  });

  it('tells the reader not to call it the owner’s label', () => {
    expect(THEY_SAVED_YOU_NOTE).toContain('Never say "you have him/her saved as');
  });
});
