import { Router, Request, Response } from 'express';
import { param, validationResult } from 'express-validator';
import {
  authenticateJwt,
  requireUserRole,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { getTaskById, updateTask } from '../../services/taskStore.service';
import { cancelAsksForTask } from '../../services/taskAsks.service';
import { setThreadStatus } from '../../services/threadStatus.service';
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
 */
tasksRouter.post(
  '/:id/stop',
  param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
  async (req: Request, res: Response<ApiResponse<{ stopped: boolean }>>): Promise<void> => {
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
      const taskId = Number(req.params.id);
      const task = await getTaskById(taskId);
      if (!task || String(task.user_id) !== userId) {
        res.status(404).json({ success: false, error: 'დავალება ვერ მოიძებნა' });
        return;
      }
      if (task.status !== 'closed') {
        await updateTask(userId, taskId, 'closed', 'stopped_by_user');
      }
      await cancelAsksForTask(taskId);
      if (task.thread_id !== null) {
        void setThreadStatus(userId, task.thread_id, 'done', { statusLine: 'შეჩერებულია' });
      }
      res.status(200).json({ success: true, data: { stopped: true } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[POST /tasks/:id/stop]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

export default tasksRouter;
