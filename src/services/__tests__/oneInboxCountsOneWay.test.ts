const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => mockQuery(...args),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { getPendingAsksForUser } from '../taskAsks.service';
import { heldUpdatesWaiting } from '../pendingUpdates.service';

/**
 * #8748: the app, WhatsApp and the connector gave three counts of what waits —
 * expired questions were listed, a goal question no longer blocking its goal was
 * counted, and the connector's total counted rows put off to a later day.
 */
describe('#8748: what waits for me is counted one way', () => {
  beforeEach(() => mockQuery.mockReset().mockResolvedValue({ rows: [] }));

  it('lists no expired question, and a bounded number', async () => {
    await getPendingAsksForUser('501');
    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain('ta.expired_at IS NULL');
    expect(sql).toMatch(/LIMIT \d+/);
  });

  it('counts a goal question only while its goal still waits on it', async () => {
    await heldUpdatesWaiting('501');
    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain('t.pending_question_at IS NOT NULL');
  });

  it('gives the connector its total off the same rows as its breakdown', () => {
    const handlers = readFileSync(join(__dirname, '..', 'mcp', 'handlers.ts'), 'utf8');
    expect(handlers).toContain('more_pending: heldWhole === null ? morePending : heldWhole.count,');
    expect(handlers).toContain('more_pending_by_kind: heldWhole.by_kind');
  });
});
