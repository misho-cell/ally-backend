import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Tester 75679 (the founder's connector, 24 Oct): the contact card still said
 * „in your contacts, saved by you as <registered nickname>" for a person who had
 * saved the founder, not the other way round. The card's own read leaves reverse
 * ties out, and a copied phonebook's labels are no member's word (Misho, 24 Oct).
 */
const src = readFileSync(join(__dirname, '..', 'ownContactByNumber.ts'), 'utf8');

describe("the contact card's own-contact read", () => {
  const fn = src.slice(src.indexOf('async function ownLabelFor('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));

  it('reads no reverse tie as the owner’s label or contact', () => {
    expect(body.match(/source IS DISTINCT FROM \$3/g)?.length).toBe(2);
    expect(body).toContain('[phone, userId, REVERSE_TIE_SOURCE]');
  });

  it('takes no label from an account that never vouches', () => {
    expect(src).toContain("AND ${notAnExcludedHolder('saver_id::int')}");
  });
});
