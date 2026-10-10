jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { connectorState } from '../connectorState.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => mockQuery.mockReset());

/** The frontend's 06:30Z item 8: has the person's Claude connector logged in. */
describe('connectorState', () => {
  it('is connected while a grant can still be refreshed, and seen at the newest grant', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ connected: true, last_seen_at: '2026-10-10T08:00:00Z' }],
    } as never);
    await expect(connectorState(171)).resolves.toEqual({
      connected: true,
      last_seen_at: '2026-10-10T08:00:00Z',
    });
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('revoked_at IS NULL AND refresh_expires_at > NOW()');
    expect(sql).not.toContain('token_hash');
    expect(params).toEqual(['171']);
  });

  it('is not connected for a person who never logged in', async () => {
    mockQuery.mockResolvedValue({ rows: [{ connected: null, last_seen_at: null }] } as never);
    await expect(connectorState(171)).resolves.toEqual({ connected: false, last_seen_at: null });
  });

  it('keeps last_seen_at when every grant was revoked or ran out', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ connected: false, last_seen_at: '2026-09-01T10:00:00Z' }],
    } as never);
    await expect(connectorState(171)).resolves.toEqual({
      connected: false,
      last_seen_at: '2026-09-01T10:00:00Z',
    });
  });
});
