import { canonicalNameForm, nameFormVariants } from '../nameForms';
import { buildRawWordGroups } from '../transliterate';

/** #5908 (the tester's 68841): a contact saved as „Leko" was missed by a search for Levan. */
describe('#5908: Levan reaches Leko, Lekso and Levana', () => {
  it('lists the short forms beside the full name', () => {
    expect(nameFormVariants('levan')).toEqual(['levan', 'levani', 'levana', 'leko', 'lekso']);
    expect(canonicalNameForm('leko')).toBe('levan');
  });

  it('reaches the short form from a Georgian query and back', () => {
    expect(buildRawWordGroups('ლევანი')[0].map((t) => t.toLowerCase())).toContain('leko');
    expect(buildRawWordGroups('ლეკო')[0].map((t) => t.toLowerCase())).toContain('levan');
  });

  it('spells the short forms in Georgian too, so a label „ლეკო" is reached (68951)', () => {
    const group = buildRawWordGroups('ლევან')[0];
    expect(group).toEqual(expect.arrayContaining(['ლეკო', 'ლექო', 'ლექსო', 'ლევანა']));
    expect(buildRawWordGroups('ნიკოლოზ')[0]).toContain('ნიკო');
  });

  it('keeps the five-letter floor for words that are not first names', () => {
    expect(buildRawWordGroups('law')[0]).not.toContain('ლავ');
  });
});
