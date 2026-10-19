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
});
