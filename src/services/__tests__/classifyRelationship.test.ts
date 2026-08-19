jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  __esModule: true,
}));
jest.mock('../../db/neo4j/client', () => ({ getSession: jest.fn(), __esModule: true }));

import { classifyExplicitRelationship, computeRelationshipScore } from '../enrichment.service';

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

// The old-Ally hand-sort (D6): allies/loyal carry over as warm; the user's
// CURRENT words still outrank the 18-month-old sort; alias guesswork never
// outranks a hand decision.
describe('computeRelationshipScore with old-Ally status', () => {
  it('the old-Ally sort beats the alias heuristic (the Kovziridze case)', () => {
    const score = computeRelationshipScore('Tamuna Kovziridze. Axel', false, undefined, 'loyal');
    expect(score.relationship_type).toBe('close');
    expect(score.strength_score).toBeCloseTo(0.7);
    expect(score.signals.old_ally_status).toBe('loyal');
  });

  it('allies scores higher than loyal', () => {
    const allies = computeRelationshipScore('Someone Full', false, undefined, 'allies');
    const loyal = computeRelationshipScore('Someone Full', false, undefined, 'loyal');
    expect(allies.strength_score).toBeGreaterThan(loyal.strength_score);
    expect(allies.relationship_type).toBe('close');
  });

  it('an explicit CURRENT statement still beats the old sort', () => {
    const score = computeRelationshipScore('Someone Full', false, 'ჩემი ბიძაშვილია', 'loyal');
    expect(score.relationship_type).toBe('family');
    expect(score.signals.explicit_insight).toBe(true);
    expect(score.signals.old_ally_status).toBeUndefined();
  });

  it('without an old-Ally status the alias heuristic still runs', () => {
    const score = computeRelationshipScore('Full Name Person', false, undefined, undefined);
    expect(score.relationship_type).toBe('formal');
  });
});
