import { VisibleFact } from '../../contactFacts.service';
import { whatYouToldMe } from '../getContactFullProfile';

function own(field_type: string, value: string): VisibleFact {
  return { field_type, value, is_public: false, visibility: 'private', first_saved: '2026-10-19' };
}

/** The tester's 68831: what the owner said about Dato, as it was saved. */
const DATO: VisibleFact[] = [
  own('note', 'ძალიან სანდოა, 2024 წელს ბინის ყიდვაში დაეხმარა'),
  own('note', 'ძალიან სანდო'),
  own('note', 'ბინის ყიდვაში დამეხმარა'),
  own('occupation', 'ადვოკატი'),
  {
    field_type: 'note',
    value: 'someone else’s public note',
    is_public: true,
    visibility: 'public',
  },
];

describe('#5941: the owner’s own notes about a person stand on their own', () => {
  it('gives the shared history and the trust, once each', () => {
    expect(whatYouToldMe(DATO)).toEqual([
      'ძალიან სანდოა, 2024 წელს ბინის ყიდვაში დაეხმარა',
      'ბინის ყიდვაში დამეხმარა',
    ]);
  });

  it('never carries another person’s note or a non-note fact', () => {
    const told = whatYouToldMe(DATO);
    expect(told).not.toContain('someone else’s public note');
    expect(told).not.toContain('ადვოკატი');
  });

  it('is empty with no notes', () => {
    expect(whatYouToldMe([own('occupation', 'ადვოკატი')])).toEqual([]);
  });
});
