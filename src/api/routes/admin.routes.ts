import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticateJwt, requireAdminRole, AuthenticatedRequest } from '../middleware/auth.middleware';
import { processAdminChat } from '../../services/adminChatService';
import {
  getInsightFields,
  getAllInsightFields,
  createInsightField,
  updateInsightField,
  toggleInsightField,
} from '../../services/insights.service';
import { ApiResponse, InsightField } from '../../types';

const adminRouter = Router();

adminRouter.use(authenticateJwt, requireAdminRole);

adminRouter.get(
  '/fields/active',
  async (req: Request, res: Response<ApiResponse<InsightField[]>>) => {
    try {
      const fields = await getInsightFields();
      res.status(200).json({ success: true, data: fields });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

adminRouter.get(
  '/fields',
  async (req: Request, res: Response<ApiResponse<InsightField[]>>) => {
    try {
      const fields = await getAllInsightFields();
      res.status(200).json({ success: true, data: fields });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

adminRouter.post(
  '/fields',
  body('field_key').isString().trim().notEmpty(),
  body('field_label').isString().trim().notEmpty(),
  body('field_description').isString().trim().notEmpty(),
  async (req: Request, res: Response<ApiResponse<InsightField>>) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() } as any);
      return;
    }

    try {
      const { field_key, field_label, field_description } = req.body as {
        field_key: string;
        field_label: string;
        field_description: string;
      };
      const field = await createInsightField(field_key, field_label, field_description);
      res.status(201).json({ success: true, data: field });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

adminRouter.put(
  '/fields/:id',
  param('id').isUUID(),
  body('field_label').isString().trim().notEmpty(),
  body('field_description').isString().trim().notEmpty(),
  async (req: Request, res: Response<ApiResponse<InsightField>>) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() } as any);
      return;
    }

    try {
      const id = req.params.id as string;
      const { field_label, field_description } = req.body as {
        field_label: string;
        field_description: string;
      };
      const field = await updateInsightField(id, field_label, field_description);
      res.status(200).json({ success: true, data: field });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

adminRouter.patch(
  '/fields/:id/toggle',
  param('id').isUUID(),
  async (req: Request, res: Response<ApiResponse<InsightField>>) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() } as any);
      return;
    }

    try {
      const id = req.params.id as string;
      const field = await toggleInsightField(id);
      res.status(200).json({ success: true, data: field });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

adminRouter.post(
  '/chat',
  body('message').isString().trim().notEmpty().isLength({ max: 4000 }),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    try {
      const { message } = req.body as { message: string };
      const adminId = (req as AuthenticatedRequest).user.userId;
      const reply = await processAdminChat(adminId, message);
      res.json({ success: true, reply });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Admin chat error:', err);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

export default adminRouter;
