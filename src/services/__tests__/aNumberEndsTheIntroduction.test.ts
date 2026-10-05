import { sharedNumberNote } from '../taskAsks.service';
import { ALLOW_CLOSE, ALLOW_OPEN } from '../privacyScrub';

/**
 * Tester 39832 (#1554): right after a number arrived, the asker was offered an
 * introduction to the same person. He already has the number.
 */
describe('a number that arrived ends the introduction offer', () => {
  it('tells the run not to offer an introduction when an answer carries a number', () => {
    const note = sharedNumberNote([
      { answer: `Dato: ${ALLOW_OPEN}995599000111${ALLOW_CLOSE}`, fromName: 'გია' },
    ]);
    expect(note).toContain('გაცნობა აღარ შესთავაზო');
    expect(note).not.toContain('995599000111');
  });

  it('says nothing for an ordinary answer', () => {
    expect(sharedNumberNote([{ answer: 'ვიცნობ კარგ ხელოსანს', fromName: 'გია' }])).toBe('');
  });
});
