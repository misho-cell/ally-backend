import { readFileSync } from 'fs';
import { join } from 'path';
import { plainWordForms } from '../firstNameNamed';
import { looksLikeContactInstruction } from '../goalIntent';
import { latinLabelNamedInGeorgian, labelNamedIn } from '../namedLabel';

/**
 * DR2 (#8615, the tester's 81317; thread 76858): the assistant proposed one
 * Lika in full, the owner answered „კითხე ლიკას", and the ask was refused four
 * times — eleven of the owner's contacts are Likas saved in Latin letters.
 */
const code = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
const OFFER =
  'პირველ ეტაპზე ლიკა ოსეფაშვილს გამოვყოფდი: ის იცნობს სამ ადამიანს. შესაძლო კავშირია: შენ → ლიკა ოსეფაშვილი → ვასიკო.';

describe('the assistant’s offer says which Lika the owner means', () => {
  it('reads „კითხე ლიკას" as an instruction whose first name is Lika in both scripts', () => {
    expect(looksLikeContactInstruction('კითხე ლიკას')).toBe(true);
    expect(plainWordForms('კითხე ლიკას')).toEqual(expect.arrayContaining(['ლიკა', 'lika']));
  });

  it('finds the one Lika the offer names in full, and not another', () => {
    expect(latinLabelNamedInGeorgian(OFFER, 'Lika Osepashvili')).toBe(true);
    expect(latinLabelNamedInGeorgian(OFFER, 'Lika Beridze')).toBe(false);
    expect(labelNamedIn(OFFER, 'ლიკა ბერიძე')).toBe(false);
  });

  it('opens the walls only when exactly one contact of that first name is in the offer', () => {
    const helper = code.slice(code.indexOf('async function offeredPersonNamedByFirstName'));
    const body = helper.slice(0, helper.indexOf('\n}\n'));
    expect(body).toContain('if (!looksLikeContactInstruction(line)) return false;');
    expect(body).toContain(
      'return namedInOffer.size === 1 && namedInOffer.has(phoneDigits(person.contactPhone));',
    );
    const walls = code.slice(code.indexOf('async function ownerJustNamedPerson'));
    expect(walls.slice(0, walls.indexOf('} catch (error)'))).toContain(
      'await offeredPersonNamedByFirstName(tapped, person)',
    );
  });
});
