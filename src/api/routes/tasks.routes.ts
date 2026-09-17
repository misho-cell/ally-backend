import { Router, Request, Response } from 'express';
import { param, validationResult } from 'express-validator';
import {
  authenticateJwt,
  requireUserRole,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { getTaskById } from '../../services/taskStore.service';
import { GoalStopped, stopGoal, stopGoalOnThread } from '../../services/goalStop.service';
import { threadLanguage } from '../../services/threads.service';
import { query } from '../../db/postgres/client';
import { ApiResponse } from '../../types';

const tasksRouter = Router();

// No subscription gate on purpose: stopping a running task must always work.
tasksRouter.use(authenticateJwt, requireUserRole);
tasksRouter.use(rateLimit({ windowMs: 60_000, max: 30 }));

/**
 * The sidebar's one number (ticket 6 task 28): open goals and their thread
 * twin, from the same rows the agent's own get_my_tasks reads — so the header
 * count, the assistant's answer and the thread list can never disagree.
 */
tasksRouter.get(
  '/summary',
  async (req: Request, res: Response<ApiResponse<unknown>>): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const [tasks, threads] = await Promise.all([
        query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM tasks WHERE user_id = $1 AND status = 'open'`,
          [userId],
        ),
        query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM threads
           WHERE user_id = $1 AND is_task = true AND status != 'done'`,
          [userId],
        ),
      ]);
      res.status(200).json({
        success: true,
        data: {
          open_goals: Number(tasks.rows[0]?.count ?? 0),
          open_task_threads: Number(threads.rows[0]?.count ?? 0),
        },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[GET /tasks/summary]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

/**
 * The user's kill switch: closes the task, cancels every unanswered ask
 * (recipients get an honest "no longer needed" line), settles the thread.
 * Idempotent — stopping a closed task succeeds.
 *
 * Ticket 20 row 113, second pass — the THREAD id is accepted here too, and the
 * earlier refusal is not being overturned so much as narrowed to what it was
 * actually about.
 *
 * `/threads/:id/stop` was built for this and works. The header button still
 * posts `/tasks/<thread id>/stop` and still 404s (the seat read it twice:
 * /tasks/15824/stop for goal 3703, /tasks/16240/stop for goal 4097), and no
 * frontend session has read the board in ninety messages, so the button stays
 * broken for as long as this route insists on being right about it.
 *
 * What was refused before — „let the route accept either kind of id" — was
 * refused because a thread id and a task id can collide inside one account and
 * a route that GUESSES could stop the wrong goal. That objection survives here
 * intact: this is not a guess. The goal lookup runs first and wins outright; a
 * thread is only consulted when the id is NOT a goal of this owner, so a
 * colliding id behaves exactly as it does today. The fallback can only turn a
 * 404 into the right goal, never one goal into another.
 *
 * Ownership is re-checked on the thread before the goal is read, for the same
 * reason the thread route does it: the goal lookup is keyed on the thread, so
 * without it somebody else's thread id would reach their goal.
 */
tasksRouter.post(
  '/:id/stop',
  param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
  async (req: Request, res: Response<ApiResponse<GoalStopped>>): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: errors
          .array()
          .map((e) => String(e.msg))
          .join(', '),
      });
      return;
    }
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const id = Number(req.params.id);
      const task = await getTaskById(id);
      if (task && String(task.user_id) === userId) {
        const lang = task.thread_id === null ? 'ka' : await threadLanguage(task.thread_id);
        res.status(200).json({ success: true, data: await stopGoal(userId, task, lang) });
        return;
      }
      const stoppedByThread = await stopGoalOnThread(userId, id, await threadLanguage(id));
      if (stoppedByThread === null) {
        res.status(404).json({ success: false, error: 'დავალება ვერ მოიძებნა' });
        return;
      }
      res.status(200).json({ success: true, data: stoppedByThread });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[POST /tasks/:id/stop]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

export default tasksRouter;
