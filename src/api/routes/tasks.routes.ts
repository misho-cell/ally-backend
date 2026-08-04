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
import { ApiResponse } from '../../types';

const tasksRouter = Router();

// No subscription gate on purpose: stopping a running task must always work.
tasksRouter.use(authenticateJwt, requireUserRole);
tasksRouter.use(rateLimit({ windowMs: 60_000, max: 30 }));

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
