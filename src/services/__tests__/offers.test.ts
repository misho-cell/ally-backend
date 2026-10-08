jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query as _query } from '../../db/postgres/client';
import { deleteOffer, listOffers, MAX_ACTIVE_OFFERS, saveOffer } from '../offers.service';
import { OFFER_NEEDS_CONFIRMATION, OFFER_OWNER_ONLY, saveOfferTool } from '../offerTools';

/**
 * 1698 (A15): what the owner is open to, saved from the chat in one confirmed
 * line; never answers anyone, never shown to another user.
 */
const mockQuery = _query as jest.Mock;
const ROW = {
  id: 3,
  text: 'Open to hospitality asks in Adjara',
  field: 'hospitality',
  created_at: 'x',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('offers (1698)', () => {
  it('saves one line with its field, lower-cased', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ n: 0 }] });
    mockQuery.mockResolvedValueOnce({ rows: [ROW] });
    await expect(
      saveOffer('7', ' Open to hospitality asks in Adjara ', 'Hospitality'),
    ).resolves.toEqual(ROW);
    expect(mockQuery.mock.calls[1][1]).toEqual([
      '7',
      'Open to hospitality asks in Adjara',
      'hospitality',
    ]);
  });

  it('refuses an empty line and a full shelf', async () => {
    await expect(saveOffer('7', '  ', 'x')).rejects.toThrow('Pass `text`');
    mockQuery.mockResolvedValueOnce({ rows: [{ n: MAX_ACTIVE_OFFERS }] });
    await expect(saveOffer('7', 'line', 'x')).rejects.toThrow('most offers');
  });

  it('lists only the owner’s active ones, and „forget that" switches one off', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [ROW] });
    await expect(listOffers('7')).resolves.toEqual([ROW]);
    expect(String(mockQuery.mock.calls[0][0])).toContain('user_id = $1::int AND active');
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    await expect(deleteOffer('7', 3)).resolves.toBe(true);
    expect(String(mockQuery.mock.calls[1][0])).toContain('SET active = FALSE');
    await expect(deleteOffer('7', Number.NaN)).resolves.toBe(false);
  });

  it('the tool saves nothing without the owner, or without their yes to the line', async () => {
    await expect(
      saveOfferTool('7', { text: 'x', field: 'y', confirmed: true }, true),
    ).resolves.toEqual({
      saved: false,
      error: OFFER_OWNER_ONLY,
    });
    await expect(saveOfferTool('7', { text: 'x', field: 'y' }, false)).resolves.toEqual({
      saved: false,
      needs_confirmation: true,
      note: OFFER_NEEDS_CONFIRMATION,
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('no run is given the tools until their texts are approved (§109)', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('const OFFER_TOOLS_ON = false;');
  });
});
