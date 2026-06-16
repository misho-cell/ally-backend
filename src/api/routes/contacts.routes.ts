import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.middleware';
import { importContacts, parseVcf } from '../../services/contacts.service';
import { ApiResponse, ImportResult } from '../../types';

const contactsRouter = Router();

contactsRouter.use(authenticateJwt);

contactsRouter.post(
  '/import',
  body('contacts')
    .isArray({ min: 1, max: 500 })
    .withMessage('contacts must be an array of 1–500 items'),
  body('contacts.*.name').isString().trim().notEmpty().withMessage('each contact must have a name'),
  body('contacts.*.phones')
    .isArray({ min: 1 })
    .withMessage('each contact must have at least one phone'),
  body('contacts.*.phones.*').isString().withMessage('phone must be a string'),
  body('contacts.*.email').optional().isString(),
  body('contacts.*.employer').optional().isString(),
  body('contacts.*.jobPosition').optional().isString(),
  body('contacts.*.city').optional().isString(),
  async (req: Request, res: Response<ApiResponse<ImportResult>>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const message = errors
        .array()
        .map((e) => e.msg)
        .join(', ');
      res.status(400).json({ success: false, error: message });
      return;
    }

    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const { contacts } = req.body as {
        contacts: Array<{
          name: string;
          phones: string[];
          email?: string;
          employer?: string;
          jobPosition?: string;
          city?: string;
        }>;
      };
      const result = await importContacts(userId, contacts);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'კონტაქტების იმპორტი ვერ მოხერხდა';
      res.status(400).json({ success: false, error: message });
    }
  },
);

contactsRouter.post(
  '/import-vcf',
  body('vcfContent')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('vcfContent is required')
    .isLength({ max: 5_000_000 })
    .withMessage('vcfContent must be under 5 MB'),
  async (req: Request, res: Response<ApiResponse<ImportResult>>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const message = errors
        .array()
        .map((e) => e.msg)
        .join(', ');
      res.status(400).json({ success: false, error: message });
      return;
    }

    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const { vcfContent } = req.body as { vcfContent: string };
      const contacts = parseVcf(vcfContent);
      if (contacts.length === 0) {
        res.status(400).json({ success: false, error: 'vCard ფაილი კონტაქტებს არ შეიცავს' });
        return;
      }
      const result = await importContacts(userId, contacts);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'vCard იმპორტი ვერ მოხერხდა';
      res.status(400).json({ success: false, error: message });
    }
  },
);

export default contactsRouter;
