jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../chat.service', () => ({ __esModule: true, processChat: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { runJoinerFirstMessages } from '../joinerFirstMessage.service';
import { isRealUserNight } from '../realUserNight';

/**
 * Misho, 31 Oct: no message started towards a real person between 03:00 and
 * 08:30 Tbilisi time (UTC+4), the joiner's first message included; the
 * morning run takes whoever joined at night.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => mockQuery.mockReset());

describe('the night in Tbilisi', () => {
  it('runs from 03:00 to 08:30 local time', () => {
    expect(isRealUserNight(new Date('2026-10-31T22:59:00Z'))).toBe(false); // 02:59
    expect(isRealUserNight(new Date('2026-10-31T23:00:00Z'))).toBe(true); // 03:00
    expect(isRealUserNight(new Date('2026-11-01T04:29:00Z'))).toBe(true); // 08:29
    expect(isRealUserNight(new Date('2026-11-01T04:30:00Z'))).toBe(false); // 08:30
  });
});

describe('a joiner’s first message', () => {
  it('is not written at night, and nobody is even looked up', async () => {
    expect(await runJoinerFirstMessages(new Date('2026-11-01T01:00:00Z'))).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('looks for joiners by day', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    expect(await runJoinerFirstMessages(new Date('2026-11-01T06:00:00Z'))).toBe(0);
    expect(mockQuery).toHaveBeenCalled();
  });

  it('reaches back far enough that a night joiner is still due in the morning', () => {
    const src = readFileSync(join(__dirname, '..', 'joinerFirstMessage.service.ts'), 'utf8');
    expect(src).toContain('const WITHIN_MINUTES = 8 * 60;');
  });
});
