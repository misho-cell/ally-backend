jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { waveSize, WAVE_SIZE_SMALL } from '../askWaves.service';

const via = (phone: string, toName: string): object => ({
  name: `via ${phone}`,
  introduction: { via_phone: phone, to_name: toName },
});

/**
 * #7630 (tester 76702: 0/3) kept three bridges to one person one at a time by
 * holding the whole wave to one ask. Misho, 9 Nov: Giorgi asked for four or five
 * people and one went — everyone else waited behind the bridges to one person.
 */
describe('a plan with several bridges to one person', () => {
  it('keeps the day’s wave for everyone else', () => {
    const plan = {
      real_work: false,
      routes: [via('995500000001', 'ბესო'), via('995500000002', 'ბესო')],
    };
    expect(waveSize(plan as never)).toBe(WAVE_SIZE_SMALL);
    expect(WAVE_SIZE_SMALL).toBeGreaterThanOrEqual(10);
  });

  it('still sends the bridges to that one person one at a time, at the send', () => {
    const tool = readFileSync(join(__dirname, '..', 'tools', 'requestIntroduction.ts'), 'utf8');
    expect(tool).toContain('await bridgeAlreadyAsked(');
  });
});
