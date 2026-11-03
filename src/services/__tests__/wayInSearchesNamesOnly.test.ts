import { firmSearchName, wayInSearchName } from '../wayInName';

/**
 * #8648: way-in checks looked for page words („შესახებ", „info", „Top"), trades
 * and emoji in the owner's phonebook; 143 of 150 found nobody, and a trade word
 * found the owner's own tradesman rather than a way into the firm.
 */
describe('way-in looks for names only (#8648)', () => {
  it.each([
    ['შესახებ | Nikora', 'Nikora'],
    ['About Our Team', ''],
    ['TOP ყველაზე', ''],
    ['📢 #ფაქტორი', 'ფაქტორი'],
    ['მმართველობა SOCAR', 'SOCAR'],
  ])('keeps only the naming words of %s', (title, expected) => {
    expect(wayInSearchName(title)).toBe(expected);
  });

  it('drops a trade from a firm title, so it cannot find the owner’s tradesman', () => {
    expect(firmSearchName('სტომატოლოგი')).toBe('');
    expect(wayInSearchName('გიორგი ბერიძე ადვოკატი')).toBe('გიორგი ბერიძე');
  });

  it('names the firm before the first dot of a web address', () => {
    expect(firmSearchName('Ostati.ge სანტექნიკი')).toBe('Ostati');
    expect(firmSearchName('silknet.com/ge/aboutus/management')).toBe('silknet');
    expect(firmSearchName('trend.az')).toBe('trend');
  });

  it('keeps an ordinary firm name', () => {
    expect(firmSearchName('Eurofish Kamer Seafood')).toBe('Eurofish');
  });
});
