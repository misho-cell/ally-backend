const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({ query: (...a: unknown[]) => mockQuery(...a) }));
const mockPost = jest.fn().mockResolvedValue({});
jest.mock('../handoff.service', () => ({
  HandoffAuthor: { ClaudeBackend: 'claude_backend' },
  postHandoff: (...a: unknown[]) => mockPost(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { alertLine, markRunAlertHandled, RunAlertKind, watchRunsOnce } from '../runAlerts.service';

/**
 * Misho, 29 Oct (Giorgi's thread 74052): a stuck, apologising or failed run
 * reaches the code session in the box by itself, once, with ids only.
 */
const STUCK = {
  kind: RunAlertKind.Stuck,
  ref: 'run-1',
  user_id: 7,
  thread_id: 74052,
  run_id: 'run-1',
  detail: 'refused: ask_contact×3, grant_task_permission×2',
  test_seat: false,
};
const rows = (r: unknown[]): never => ({ rows: r, rowCount: r.length }) as never;

beforeEach(() => jest.clearAllMocks());

describe('the run watch (Misho, 29 Oct)', () => {
  it('stores a new finding once and posts one box line, real people first', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([STUCK]))
      .mockResolvedValueOnce(
        rows([{ ...STUCK, kind: RunAlertKind.Apology, ref: 'm1', test_seat: true }]),
      )
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([{ id: 1 }]))
      .mockResolvedValueOnce(rows([]));
    const fresh = await watchRunsOnce();
    expect(fresh).toHaveLength(1);
    expect(String(mockQuery.mock.calls[3][0])).toContain('ON CONFLICT (kind, ref) DO NOTHING');
    const line = mockPost.mock.calls[0][1] as string;
    expect(line).toContain('thread 74052 (REAL PERSON)');
    expect(line).toContain('GET /admin/run-alerts');
  });

  it('posts nothing when nothing is new', async () => {
    mockQuery.mockResolvedValue(rows([]));
    expect(await watchRunsOnce()).toEqual([]);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('lists real people before test seats', () => {
    const line = alertLine([{ ...STUCK, test_seat: true, thread_id: 1 }, STUCK]);
    expect(line.indexOf('REAL PERSON')).toBeLessThan(line.indexOf('test seat'));
  });

  it('marks one handled, and says when there is none open', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    expect(await markRunAlertHandled(1)).toBe(true);
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect(await markRunAlertHandled(2)).toBe(false);
  });

  it('never stores words: ids, tool names and counts only; a designed stop is no fault', () => {
    const code = readFileSync(join(__dirname, '..', 'runAlerts.service.ts'), 'utf8');
    expect(code).not.toMatch(/content AS detail|error_text AS detail/u);
    expect(code).toContain("const DESIGNED_STOP_PREFIX = 'Not searched%'");
    const admin = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(admin).toContain("adminRouter.get('/run-alerts'");
    expect(admin).toContain("adminRouter.post('/run-alerts/:id/handled'");
  });
});
