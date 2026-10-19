const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { latinLabelNamedInGeorgian, labelNamedIn } from '../namedLabel';
import { OwnerTieReason, ownerTiesTo } from '../ownerTies';

/** #6339 (Giorgi, G-085/G-086, thread 60691). */
describe('#6339: a Georgian line names a contact saved in Latin letters', () => {
  const LABEL = 'Lika Osepashvili';

  it('reads the full name with a case ending and „-ც"', () => {
    expect(labelNamedIn('ლიკა ოსეფაშვილსაც კითხე', LABEL)).toBe(false);
    expect(latinLabelNamedInGeorgian('ლიკა ოსეფაშვილსაც კითხე', LABEL)).toBe(true);
    expect(latinLabelNamedInGeorgian('ჰკითხე ლიკა ოსეფაშვილს', LABEL)).toBe(true);
    expect(latinLabelNamedInGeorgian('ლიკა ოსეფაშვილი მოიკითხე', LABEL)).toBe(true);
  });

  it('needs every word of the label, and a label of two words or more', () => {
    expect(latinLabelNamedInGeorgian('ლიკასაც კითხე', LABEL)).toBe(false);
    expect(latinLabelNamedInGeorgian('ლიკა ოსეფაშვილაძეს კითხე', LABEL)).toBe(false);
    expect(latinLabelNamedInGeorgian('ლიკასაც კითხე', 'Lika')).toBe(false);
  });

  it('leaves Georgian labels and Latin sentences to the matching that was there', () => {
    expect(latinLabelNamedInGeorgian('ask Lika Osepashvili', LABEL)).toBe(false);
    expect(latinLabelNamedInGeorgian('ლიკა ოსეფაშვილსაც კითხე', 'ლიკა ოსეფაშვილი')).toBe(false);
  });
});

describe('#6339: „has helped you before" only when they helped the owner', () => {
  beforeEach(() => mockQuery.mockReset());

  function rows(answered: readonly string[], helpedOwner: readonly string[]): void {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: answered.map((phone) => ({
          contact_phone: phone,
          total: '0.2',
          events: '3',
          kinds: ['ask_answered'],
        })),
      })
      .mockResolvedValueOnce({ rows: helpedOwner.map((phone) => ({ phone })) });
  }

  it('says nothing when it was the owner who answered their questions', async () => {
    rows(['+995500004420'], []);
    const ties = await ownerTiesTo('501', ['+995500004420']);
    expect(ties.get('995500004420')?.reason).toBeNull();
  });

  it('says it when they answered the owner’s own question', async () => {
    rows(['+995500004420'], ['+995500004420']);
    const ties = await ownerTiesTo('501', ['+995500004420']);
    expect(ties.get('995500004420')?.reason).toBe(OwnerTieReason.DealtWith);
  });

  it('asks whose question it was, and whose introduction', async () => {
    rows(['+995500004420'], []);
    await ownerTiesTo('501', ['+995500004420']);
    const sql = String(mockQuery.mock.calls[2][0]);
    expect(sql).toContain('a.from_user_id = $1::int AND a.declined_at IS NULL');
    expect(sql).toContain('ir.requester_user_id = $1::int');
  });

  it('does not ask at all when nobody answered anything', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await ownerTiesTo('501', ['+995500004420']);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});

describe('#6339: wired into the ask wall', () => {
  it('reads this contact’s own labels before the first-name fallback', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain(
      '(await latinLabelOfThisContactNamed(line, person)) || onlyContactByFirstName(line, person)',
    );
  });
});
