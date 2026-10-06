import { readFileSync } from 'fs';
import { join } from 'path';
import { NameRow, registeredSpelling } from '../searchContactByName';

/**
 * #1355 (Tornike, 5 Oct): asked „what is his surname exactly", Netai confirmed
 * the owner's misspelling. The member's own spelling now rides beside the
 * owner's label, so the model has the right one to give.
 */
function row(name: string | null, registered: string | null): NameRow {
  return { phone: '+995500000001', name, saved_as: name, registered_name: registered } as NameRow;
}

describe("a member's own spelling", () => {
  it('rides beside a label that spells him differently', () => {
    expect(registeredSpelling(row('Giorgi Beridze', 'Giorgi Weridze'), true)).toEqual({
      registered_name: 'Giorgi Weridze',
    });
  });

  it('is left out when the label already spells it so, in any case', () => {
    expect(registeredSpelling(row('giorgi beridze', 'Giorgi Beridze'), true)).toEqual({});
  });

  it('is only a member’s, and never an email standing in for a name', () => {
    expect(registeredSpelling(row('Giorgi', 'Giorgi Beridze'), false)).toEqual({});
    expect(registeredSpelling(row('Giorgi', 'giorgi@example.com'), true)).toEqual({});
    expect(registeredSpelling(row('Giorgi', null), true)).toEqual({});
  });

  it('is given when the owner asks how the name is spelled — said in the tool', () => {
    const chat = readFileSync(join(__dirname, '..', '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('`registered_name` (a Netai member, only when it differs from `name`)');
    expect(chat).toContain("never the user's own typing");
  });
});
