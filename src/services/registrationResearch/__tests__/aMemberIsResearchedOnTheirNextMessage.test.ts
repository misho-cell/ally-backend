jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../tools/webSearch', () => ({
  __esModule: true,
  webSearch: jest.fn(),
  fetchPage: jest.fn(),
}));
jest.mock('../extract', () => ({
  __esModule: true,
  extractFacts: jest.fn(),
  extractResearch: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../../db/postgres/client';
import { queueResearchOnActivation, RESEARCH_ON_ACTIVATION } from '../registrationResearch.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/** #7426 (D876): a member who joined before research ran is researched on their next message. */
describe('research on a member’s next message', () => {
  beforeEach(() => mockQuery.mockReset());

  it('is off until Misho says yes (it is paid search and reading)', async () => {
    expect(RESEARCH_ON_ACTIVATION).toBe(false);
    await expect(queueResearchOnActivation(501)).resolves.toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('queues a member once, never a test seat, and asks the database once per process', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1, rows: [] } as never);
    await expect(queueResearchOnActivation(502, true)).resolves.toBe(true);
    await expect(queueResearchOnActivation(502, true)).resolves.toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('NOT EXISTS (SELECT 1 FROM test_seats');
    expect(String(sql)).toContain('ON CONFLICT (user_id) DO NOTHING');
    expect(params).toEqual([502]);
  });

  it('is asked from the owner’s own message, without waiting for it', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', '..', 'api', 'routes', 'threads.routes.ts'),
      'utf8',
    );
    expect(routes).toContain('void queueResearchOnActivation(Number(userId))');
  });
});
