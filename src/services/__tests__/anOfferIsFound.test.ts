const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: mockQuery }));

import { OFFERS_NOTE, offersMatching, withOffers } from '../tools/searchOffers';

/** #8525: a member's „Odoo / ERP" offer was not found by „ERP". */
describe('offers in the insight search (#8525)', () => {
  beforeEach(() => mockQuery.mockReset());

  it('finds the owner’s contacts whose offer matches the words', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ saved_as: 'ნიკა', text: 'Odoo / ERP დანერგვა' }] });
    await expect(offersMatching('501', 'ERP')).resolves.toEqual([
      { saved_as: 'ნიკა', open_to: 'Odoo / ERP დანერგვა' },
    ]);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('a."contactId" = $1::int');
    expect(sql).toContain('o.active');
    expect(params[0]).toBe('501');
  });

  it('adds them with the note not to quote them', () => {
    const out = withOffers({ found: false }, [{ saved_as: 'ნიკა', open_to: 'ERP' }]) as Record<
      string,
      unknown
    >;
    expect(out.open_to_help).toHaveLength(1);
    expect(out.open_to_help_note).toBe(OFFERS_NOTE);
  });

  it('leaves the result as it was when nothing matches', () => {
    const result = { found: true, results: [] };
    expect(withOffers(result, [])).toBe(result);
  });
});
