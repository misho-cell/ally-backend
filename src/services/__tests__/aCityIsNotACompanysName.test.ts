import { readFileSync } from 'fs';
import { join } from 'path';
import { wayInSearchName } from '../wayInName';

/**
 * The old seat's notes to 1101 (32983): „…ZROBIM architects თბილისი,
 * საქართველო — your contact there: ვასო სანტექნიკი თბილისი".
 */
describe('the words a web lead is looked up by', () => {
  it('leave out places and generic words', () => {
    expect(wayInSearchName('არქიტექტურული სტუდია ZROBIM architects თბილისი, საქართველო')).toBe(
      'არქიტექტურული ZROBIM architects',
    );
    expect(wayInSearchName('Vake Dental Studio, Tbilisi, Georgia')).toBe('Vake Dental');
  });

  it('are nothing when only places and generic words remain', () => {
    expect(wayInSearchName('სტუდია თბილისში, საქართველო')).toBe('');
  });

  it('keep a plain company name as it is', () => {
    expect(wayInSearchName('Arci')).toBe('Arci');
  });

  it('are what the way-in search is given, and an empty one checks nothing', () => {
    const src = readFileSync(join(__dirname, '..', 'openingSearch.service.ts'), 'utf8');
    expect(src).toContain(
      'leadsFirstName(name) === null ? firmSearchName(name) : wayInSearchName(name);',
    );
    expect(src).toContain('exactMatchesForMany(userId, pass)');
    expect(src).toContain("out.set(name, { kind: 'none' });");
  });
});
