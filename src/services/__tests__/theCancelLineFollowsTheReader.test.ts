import { languageOfConversation } from '../runLanguage';

/**
 * Row 260's last residue, the seat's 850: goal 11155 closed on 29 Sep 20:50
 * and Test 16 — who writes English and got the ask in English — was let off
 * in Georgian. He never wrote in that ask thread, so `threadLanguage` read his
 * account-wide messages: „Send it" and „Yes. Baxva Gamogonili does the books…".
 * Before 30 Sep's word-per-script count, a capitalised Georgian-looking name
 * and a two-word reply could tip that to Georgian. They must not.
 */
describe('the „no longer needed" line follows the reader', () => {
  it("reads Test 16's own words as English", () => {
    expect(
      languageOfConversation('Send it', [
        'Yes. Baxva Gamogonili does the books for two small companies I know and he is careful',
      ]),
    ).toBe('en');
  });

  it('reads a short English reply as English even with nothing before it', () => {
    expect(languageOfConversation('Send it', [])).toBe('en');
    expect(languageOfConversation('Yes', [])).toBe('en');
  });
});
