jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { bridgesToOnePerson, waveSize, WAVE_SIZE_SMALL } from '../askWaves.service';

const via = (phone: string, toName: string): object => ({
  name: `via ${phone}`,
  introduction: { via_phone: phone, to_name: toName },
});

/** #7630 (tester 76702: 0/3): three bridges to one person, one at a time. */
describe('the wave of a plan with several bridges to one person', () => {
  it('holds one ask', () => {
    const plan = {
      real_work: false,
      routes: [
        via('995500000001', 'ბესო'),
        via('995500000002', 'ბესო'),
        via('995500000003', 'Beso'),
      ],
    };
    expect(bridgesToOnePerson(plan)).toBe(true);
    expect(waveSize(plan as never)).toBe(1);
  });

  it('keeps its usual size when each bridge leads to a different person', () => {
    const plan = {
      real_work: false,
      routes: [via('995500000001', 'ნინო'), via('995500000002', 'ლუკა')],
    };
    expect(bridgesToOnePerson(plan)).toBe(false);
    expect(waveSize(plan as never)).toBe(WAVE_SIZE_SMALL);
  });
});
