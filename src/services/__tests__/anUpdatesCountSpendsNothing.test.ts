jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { countUpdatesForBadge, peekDueUpdates, STORY_LINES_MAX } from '../pendingUpdates.service';
import { storyLine } from '../updateCard';

/**
 * #387, the frontend's ask: a badge count that does not release or mark
 * anything, because GET /updates does both in the same breath.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => jest.clearAllMocks());

describe('countUpdatesForBadge', () => {
  it('counts what is due now and what waits for later', async () => {
    mockQuery.mockResolvedValue({ rows: [{ due: '2', held: '3' }], rowCount: 1 } as never);

    expect(await countUpdatesForBadge('165699')).toEqual({ due: 2, held: 3 });
  });

  it('only reads: no UPDATE, and the release query’s own conditions', async () => {
    mockQuery.mockResolvedValue({ rows: [{ due: '0', held: '0' }], rowCount: 1 } as never);

    await countUpdatesForBadge('165699');

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql.trim().startsWith('SELECT')).toBe(true);
    expect(sql).not.toMatch(/\bUPDATE\b/);
    expect(sql).toContain("p.status = 'held'");
    expect(sql).toContain('t.pending_question_at IS NOT NULL');
    expect(params[0]).toBe('165699');
  });

  it('answers zero for an owner with nothing waiting', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    expect(await countUpdatesForBadge('165699')).toEqual({ due: 0, held: 0 });
  });
});

describe('the route', () => {
  it('is GET /updates/count, behind the router’s login', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'updates.routes.ts'),
      'utf8',
    );
    expect(routes).toContain('updatesRouter.use(authenticateJwt, requireUserRole);');
    expect(routes).toContain("'/count',");
    expect(routes.indexOf("'/count',")).toBeGreaterThan(
      routes.indexOf('updatesRouter.use(authenticateJwt, requireUserRole);'),
    );
  });
});

/** The frontend's 06:30Z item 5: the home card's lines, read without spending anything. */
describe('the story lines', () => {
  it('peek at the first due updates only: a SELECT, the count’s own conditions, at most three', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await peekDueUpdates('165699');

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql.trim().startsWith('SELECT')).toBe(true);
    expect(sql).not.toMatch(/\bUPDATE\b/);
    expect(sql).toContain("p.status = 'held'");
    expect(sql).toContain('p.release_at <= NOW()');
    expect(sql).toContain('t.pending_question_at IS NOT NULL');
    expect(params).toEqual(['165699', expect.any(Array), expect.any(Array), STORY_LINES_MAX]);
    expect(STORY_LINES_MAX).toBe(3);
  });

  it('say the card’s own title, and its detail when it has one', () => {
    expect(storyLine({ title: 'Office in Rustavi', detail: '' })).toBe('Office in Rustavi');
    expect(storyLine({ title: 'Office in Rustavi', detail: 'Levan answered' })).toBe(
      'Office in Rustavi — Levan answered',
    );
  });

  it('ride on GET /updates/count beside the counts', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'updates.routes.ts'),
      'utf8',
    );
    expect(routes).toContain('data: { ...counts, followed, lines }');
    expect(routes).toContain("storyLines(userId, asRunLanguage(req.get('X-Locale')))");
  });
});
