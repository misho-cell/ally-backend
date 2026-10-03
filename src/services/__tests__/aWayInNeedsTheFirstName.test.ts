import { sameFirstName } from '../wayInName';
import { leadsFirstName } from '../openingSearch.service';

/**
 * The tester's 1117 (34779): a web person was shown with „your contact there:"
 * and another person who only shares the surname.
 */
describe('a way in to a web person', () => {
  it('needs the contact to carry the lead’s first name, in either script', () => {
    expect(sameFirstName('ნინი', 'ნინი ელისაშვილი')).toBe(true);
    expect(sameFirstName('Nini', 'ნინი ელისაშვილი')).toBe(true);
    expect(sameFirstName('ნინი', 'გიორგი ელისაშვილი')).toBe(false);
  });

  it('matches a firm as before', () => {
    expect(sameFirstName(null, 'ვასო BLC')).toBe(true);
  });

  it('reads a first name the lists hold, and none for a firm', () => {
    expect(leadsFirstName('ნინო ბერიძე')).toBe('ნინო');
    expect(leadsFirstName('BLC Law Office')).toBeNull();
  });
});
