import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #7921 (founder, 26 Oct): the engagement nudge read „ტიკოსა და ერეკლეს პასუხი
 * ელოდება" and misspelled a surname the chat spells right. Misho's yes, 26 Oct.
 */
const source = readFileSync(join(__dirname, '..', 'aiNotification.service.ts'), 'utf8');

describe('a nudge names people as the chat does', () => {
  it('is given who the owner is waiting on, named as the owner saved them', () => {
    expect(source).toContain('ASKED_AS_THE_ASKER_SAVED_THEM} AS name');
    expect(source).toContain("ta.from_user_id = $1::int AND ta.status = 'sent'");
    expect(source).toContain('## ვისაც ახლა პასუხს ელოდება');
  });

  it('is told to name only from that list, in full, as spelled', () => {
    expect(source).toContain('პირველად სრული სახელით და გვარით');
    expect(source).toContain('არ შეამოკლო და არ შეცვალო მართლწერა');
  });
});
