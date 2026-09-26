jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../taskStore.service', () => ({ __esModule: true, updateTask: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';

import { query } from '../../db/postgres/client';
import { updateTask } from '../taskStore.service';
import { closeOneGoal } from '../seatContacts.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockUpdate = updateTask as jest.MockedFunction<typeof updateTask>;

const rows = (data: unknown[]): { rows: unknown[]; rowCount: number } => ({
  rows: data,
  rowCount: data.length,
});

beforeEach(() => jest.clearAllMocks());

/**
 * §64 — Misho, 26 September, on goals #2740 / #2773: CLOSE them, do not delete
 * them. Deleting a goal does not exist in this product — there is no
 * `DELETE FROM tasks` anywhere — and building it for two rows would make a
 * button that then works on every goal anybody has.
 */
describe('an administrative close is a close, not a deletion', () => {
  const source = readFileSync(join(__dirname, '..', 'seatContacts.service.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const fromClose = code.slice(code.indexOf('export async function closeOneGoal'));
  const nextExport = fromClose.indexOf('export ', 1);
  const closePart = nextExport === -1 ? fromClose : fromClose.slice(0, nextExport);

  it('never deletes the row', () => {
    expect(closePart).not.toContain('DELETE FROM tasks');
    expect(code).not.toContain('DELETE FROM tasks');
  });

  /**
   * ⚠️ `stopped`, NEVER `finished`. `updateTask` queues row 272's feedback
   * questions on a `finished` close — „what came of it?", „would you pay for
   * it?" — so a tidy-up closed as finished would ask its owner what came of a
   * goal that came to nothing.
   */
  it('closes as stopped, so no feedback question is queued', async () => {
    mockQuery.mockResolvedValueOnce(
      rows([{ user_id: '167250', title: 'a plumber', status: 'open' }]) as never,
    );
    mockUpdate.mockResolvedValue(true);

    const out = await closeOneGoal(2740, 'tidied away at the owner’s request');

    expect(out).toEqual({
      ok: true,
      goal: {
        task_id: 2740,
        owner: '167250',
        title: 'a plumber',
        closed_as: 'stopped',
        reason: 'tidied away at the owner’s request',
      },
    });
    expect(mockUpdate).toHaveBeenCalledWith(
      '167250',
      2740,
      'closed',
      'tidied away at the owner’s request',
      'stopped',
    );
  });

  /** Through updateTask, which is the one place every close in the codebase lands. */
  it('goes through updateTask rather than its own UPDATE', () => {
    expect(closePart).toContain('updateTask(');
    expect(closePart).not.toContain('UPDATE tasks');
  });

  /** A second call must not rewrite why a goal was closed the first time. */
  it('refuses a goal that is already closed', async () => {
    mockQuery.mockResolvedValueOnce(
      rows([{ user_id: '501', title: 'x', status: 'closed' }]) as never,
    );

    expect(await closeOneGoal(2773, 'a good reason')).toEqual({
      ok: false,
      refusal: 'already_closed',
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('refuses a goal that does not exist', async () => {
    mockQuery.mockResolvedValueOnce(rows([]) as never);

    expect(await closeOneGoal(999999, 'a good reason')).toEqual({
      ok: false,
      refusal: 'no_such_goal',
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it.each(['', '  ', 'ab'])('refuses the reason %p before reading anything', async (reason) => {
    expect(await closeOneGoal(2740, reason)).toEqual({ ok: false, refusal: 'bad_reason' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  /**
   * ONE ID, NEVER A RULE — the same principle `/admin/goals/hidden` carries:
   * a rule applied to rows nobody has read is how a goal somebody still
   * wanted disappears.
   */
  it('takes one id and has no way to express a rule', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    const route = routes.slice(routes.indexOf("'/goals/:id/close'"));
    expect(route.slice(0, 1200)).toContain("param('id').isInt({ min: 1 })");
    expect(route.slice(0, 1200)).not.toContain('isArray');
  });
});
