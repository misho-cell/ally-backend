import { readFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_PUSH_TIME_ZONE, isQuietHour } from '../pushQuietHours';

/** #7234 night 1 (thread 66182, 00:10 Tbilisi): invite asks wait out the quiet hours (Misho, 26 Oct). */
describe('invite asks wait for the morning', () => {
  it('skips the send tick between 23:00 and 09:30 Tbilisi', () => {
    const cron = readFileSync(join(__dirname, '..', 'chorusCampaign.cron.ts'), 'utf8');
    const tick = cron.slice(cron.indexOf('setInterval(() => {\n    // #7234'));
    expect(tick.slice(0, 400)).toContain(
      'if (isQuietHour(new Date(), DEFAULT_PUSH_TIME_ZONE)) return;\n    void sendDueCampaignAsks(',
    );
    expect(isQuietHour(new Date('2026-10-25T20:10:00Z'), DEFAULT_PUSH_TIME_ZONE)).toBe(true);
    expect(isQuietHour(new Date('2026-10-26T08:00:00Z'), DEFAULT_PUSH_TIME_ZONE)).toBe(false);
  });
});
