jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { sendDueCampaignAsks } from '../chorusCampaign.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * Row 301 kept campaign asks inside 08:00–22:00 Tbilisi (D472), because an ask
 * rang a real person's phone. Since 2 October the push waits instead (G-002,
 * push quiet hours: 23:00–09:30 on the device's own clock), so the ask itself
 * lands in the app at any hour — Misho retired the old gate.
 */
describe('Chorus at night', () => {
  afterEach(() => jest.useRealTimers());

  it('reads what is due at 03:00 Tbilisi like at any other hour', async () => {
    jest.useFakeTimers({
      now: new Date('2026-10-02T23:00:00Z'),
      doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'nextTick', 'queueMicrotask'],
    });
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    expect(await sendDueCampaignAsks(50)).toBe(0);
    expect(mockQuery).toHaveBeenCalled();
  });

  it('keeps no clock of its own any more', () => {
    const chorus = readFileSync(join(__dirname, '..', 'chorusCampaign.service.ts'), 'utf8');
    expect(chorus).not.toContain('isAWakingHour');
  });
});
