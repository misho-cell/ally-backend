import { readFileSync } from 'fs';
import { join } from 'path';
import { OwnerTieReason, TIE_NOTE, tieToShow } from '../ownerTies';

/** #6366 (Giorgi, G-104): „(უკვე დაგეხმარა)" is never said to the owner. */
describe('#6366: who helped before stays inside', () => {
  it('has no note in any language', () => {
    for (const notes of Object.values(TIE_NOTE)) {
      expect(notes[OwnerTieReason.DealtWith]).toBeUndefined();
    }
    expect(JSON.stringify(TIE_NOTE)).not.toContain('დაგეხმარა');
  });

  it('is never handed to the model as a go-between’s tie, while the close ties are', () => {
    expect(tieToShow(OwnerTieReason.DealtWith)).toBeNull();
    expect(tieToShow(OwnerTieReason.Family)).toBe(OwnerTieReason.Family);
    expect(tieToShow(undefined)).toBeNull();
  });

  it('is filtered where the search and the warm path name a tie', () => {
    const tools = join(__dirname, '..', 'tools');
    expect(readFileSync(join(tools, 'searchSecondDegree.ts'), 'utf8')).toContain('tieToShow(');
    expect(readFileSync(join(tools, 'findWarmPath.ts'), 'utf8')).toContain('tieToShow(');
  });
});
