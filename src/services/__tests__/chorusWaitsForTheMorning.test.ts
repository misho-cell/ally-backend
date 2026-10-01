jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../taskAsks.service', () => ({
  __esModule: true,
  isAWakingHour: jest.fn(() => false),
  tbilisiHour: jest.fn(() => 3),
}));

import { query } from '../../db/postgres/client';
import { sendDueCampaignAsks } from '../chorusCampaign.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * Row 301, before the restart: a campaign ask is a push to a real person, and
 * the send tick runs every 15 minutes all night. Outside 08:00–22:00 Tbilisi
 * nothing is read and nothing is sent; what is due waits for the morning.
 */
describe('Chorus waits for the morning', () => {
  it('sends nothing at night and does not even read what is due', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(await sendDueCampaignAsks(50)).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('no campaign asks until 08:00'));
    log.mockRestore();
  });
});
