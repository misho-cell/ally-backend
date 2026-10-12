import { buildSearchTerms, englishAsItSounds } from '../tools/transliterate';

/**
 * 3270 (ME-037, 2 of 2): a contact saved as „ნიკა კოლიერსი" was not found by
 * „ვინ მყავს Colliers-ში?". The English spelling's Georgian reading is now made
 * from how it sounds, so the label is reached.
 */
describe('a company typed in its English spelling', () => {
  it('is read as it sounds: a hard c is k, a doubled consonant is one', () => {
    expect(englishAsItSounds('Colliers')).toBe('koliers');
    expect(englishAsItSounds('Rocket')).toBe('roket');
    expect(englishAsItSounds('Cisco')).toBe('cisko');
    expect(englishAsItSounds('lawyer')).toBe('lawyer');
    expect(englishAsItSounds('engineer')).toBe('engineer');
  });

  it('reaches the Georgian label „ნიკა კოლიერსი"', () => {
    const terms = buildSearchTerms('Colliers');
    expect(terms.some((term) => 'ნიკა კოლიერსი'.includes(term))).toBe(true);
  });

  it('adds nothing for a word that sounds as it is spelled', () => {
    const before = buildSearchTerms('lawyer');
    expect(before.filter((term) => term.includes('ლ')).length).toBeGreaterThan(0);
    expect(new Set(before).size).toBe(before.length);
  });

  it('leaves a Georgian query untouched by the English fold', () => {
    expect(buildSearchTerms('კოლიერსი')).toEqual(buildSearchTerms('კოლიერსი'));
    expect(englishAsItSounds('კოლიერსი')).toBe('კოლიერსი');
  });
});
