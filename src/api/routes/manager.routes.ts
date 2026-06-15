import { Router, Request, Response, NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';
import {
  createInsightField,
  getAllInsightFields,
  toggleInsightField,
  updateInsightField,
} from '../../services/insights.service';
import { ApiResponse, InsightField } from '../../types';

const managerRouter = Router();

function handleValidationErrors(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
): void {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const message = errors
      .array()
      .map((err) => err.msg)
      .join(', ');

    res.status(400).json({ success: false, error: message });
    return;
  }

  next();
}

managerRouter.get(
  '/insight-fields',
  async (req: Request, res: Response<ApiResponse<InsightField[]>>) => {
    try {
      const fields = await getAllInsightFields();
      res.status(200).json({ success: true, data: fields });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to list insight fields';
      res.status(500).json({ success: false, error: message });
    }
  },
);

managerRouter.post(
  '/insight-fields',
  body('field_key').isString().trim().notEmpty().withMessage('field_key is required'),
  body('field_label').isString().trim().notEmpty().withMessage('field_label is required'),
  body('field_description')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('field_description is required'),
  handleValidationErrors,
  async (req: Request, res: Response<ApiResponse<InsightField>>) => {
    try {
      const { field_key, field_label, field_description } = req.body as {
        field_key: string;
        field_label: string;
        field_description: string;
      };

      const field = await createInsightField(
        field_key.trim(),
        field_label.trim(),
        field_description.trim(),
      );
      res.status(201).json({ success: true, data: field });
    } catch (error) {
      const message =
        error instanceof Error && error.message.includes('duplicate key')
          ? 'An insight field with this key already exists'
          : error instanceof Error
            ? error.message
            : 'Unable to create insight field';
      res.status(400).json({ success: false, error: message });
    }
  },
);

managerRouter.put(
  '/insight-fields/:id',
  param('id').isUUID().withMessage('Valid field id is required'),
  body('field_label').isString().trim().notEmpty().withMessage('field_label is required'),
  body('field_description')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('field_description is required'),
  handleValidationErrors,
  async (req: Request, res: Response<ApiResponse<InsightField>>) => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const field_label = String(req.body.field_label);
      const field_description = String(req.body.field_description);

      const field = await updateInsightField(id, field_label.trim(), field_description.trim());
      res.status(200).json({ success: true, data: field });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update insight field';
      res.status(400).json({ success: false, error: message });
    }
  },
);

managerRouter.patch(
  '/insight-fields/:id/toggle',
  param('id').isUUID().withMessage('Valid field id is required'),
  handleValidationErrors,
  async (req: Request, res: Response<ApiResponse<InsightField>>) => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const field = await toggleInsightField(id);
      res.status(200).json({ success: true, data: field });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to toggle insight field';
      res.status(400).json({ success: false, error: message });
    }
  },
);

export default managerRouter;
