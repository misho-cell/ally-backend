jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  __esModule: true,
}));
jest.mock('../../db/neo4j/client', () => ({ getSession: jest.fn(), __esModule: true }));

import { classifyExplicitRelationship } from '../enrichment.service';

// Ticket 6 close §5: keyword matching on free text scored an investee as
// FAMILY because his note said "grew up in a trucking family". While fixing
// it, two Georgian traps surfaced: bare შვილ matched every "-შვილი" surname
// and ბიძ matched the first name ბიძინა. This suite locks the whole class.
describe('classifyExplicitRelationship', () => {
  it.each([
    ['ჩემი ბიძაშვილია', 'family'],
    ['ჩემი შვილია', 'family'],
    ['დედაჩემის მეზობელი', 'family'],
    ['ოჯახის წევრი', 'family'],
    ['his brother works at TBC', 'family'],
    ['my family friend', 'family'],
    ['ახლო მეგობარი', 'close'],
    ['ძმაკაცი', 'close'],
    ['best friend from school', 'close'],
    ['კოლეგა Grid-იდან', 'professional'],
    ['business partner', 'professional'],
  ])('classifies %s as %s', (text, expected) => {
    expect(classifyExplicitRelationship(text)).toBe(expected);
  });

  it.each([
    // The Maxo case: a common noun in an unrelated sense is NOT kinship.
    'grew up in a trucking family, obsessed with supply chain',
    // Every Georgian "-შვილი" surname used to score family 0.9.
    'დავით ჯავახიშვილი ჩემი იურისტია',
    // ბიძინა is a first name, not an uncle.
    'ბიძინა ივანიშვილი',
    // დედაქალაქი is the capital city, not a mother.
    'დედაქალაქში ცხოვრობს',
    'brotherhood of steel',
  ])('returns null (or non-family) for: %s', (text) => {
    expect(classifyExplicitRelationship(text)).not.toBe('family');
  });

  it('returns null when nothing relational appears', () => {
    expect(classifyExplicitRelationship('იურისტი, ხელშეკრულებები, კარგი სპეციალისტი')).toBeNull();
  });
});
