jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  query: jest.fn(),
  __esModule: true,
}));
jest.mock('../chat.service', () => ({ __esModule: true, processChat: jest.fn() }));

import { onlyANoSinceLastHeard } from '../taskEngine.service';

/**
 * The tester's battery (6 Nov, C6): „არავის ვიცნობ", then a minute later the
 * helper's father by name. Only the part the owner has not heard is read.
 */
const FIRST = 'გელა არავის იცნობს.';
const LATE = 'მოგვიანებით გაიხსენა: მამამისი ელექტრიკოსია, გია მელია.';

describe('a late name after a no', () => {
  it('is news, though the stored answer still begins with the no', () => {
    const ask = { answer: `${FIRST}\n${LATE}`, declined: false };
    expect(onlyANoSinceLastHeard(ask, LATE)).toBe(false);
  });

  it('is news after a decline button too', () => {
    const ask = { answer: `${FIRST}\n${LATE}`, declined: true };
    expect(onlyANoSinceLastHeard(ask, LATE)).toBe(false);
  });

  it('leaves a lone no a no', () => {
    expect(onlyANoSinceLastHeard({ answer: FIRST, declined: false }, FIRST)).toBe(true);
    expect(onlyANoSinceLastHeard({ answer: 'x', declined: true }, 'x')).toBe(true);
  });
});
