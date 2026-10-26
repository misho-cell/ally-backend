const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { bridgeAlreadyAsked, oneBridgeAtATimeNote } from '../oneBridgeAtATime';

const target = {
  requesterUserId: '2978',
  mediatorUserId: 1036,
  targetUserId: 526,
  targetName: 'ბესო ორთოიძე',
};

beforeEach(() => jest.resetAllMocks());

/** #7630: Lasha's request for Beso went to four bridges inside eleven seconds. */
describe('one person, one bridge at a time', () => {
  it('finds another bridge still pending on the same person inside the day', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ mediator_name: 'George', hours_ago: 0 }] });
    expect(await bridgeAlreadyAsked(target)).toEqual({ mediatorName: 'George', hoursAgo: 0 });
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("ir.status = 'pending'");
    expect(sql).toContain('ir.mediator_user_id <> $2::int');
    expect(params).toEqual(['2978', 1036, 526, 'ბესო ორთოიძე', 24]);
  });

  it('lets the request go when no other bridge is waiting', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await bridgeAlreadyAsked(target)).toBeNull();
  });

  it('tells the run who was asked first and when the next one goes', () => {
    const note = oneBridgeAtATimeNote({ mediatorName: 'George', hoursAgo: 3 }, 'ბესო');
    expect(note).toContain('George');
    expect(note).toContain('21 საათში');
  });

  it('guards every bridged request_introduction before anything is written', () => {
    const tool = readFileSync(join(__dirname, '..', 'tools', 'requestIntroduction.ts'), 'utf8');
    const guard = tool.indexOf('await bridgeAlreadyAsked(');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(tool.indexOf('INSERT INTO introduction_requests'));
    expect(tool).toContain("reason: 'another_bridge_pending'");
  });
});
