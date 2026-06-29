import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireSubscription } from '../middleware/subscription.middleware';
import { captureDeviceFingerprint } from '../middleware/deviceFingerprint.middleware';
import { importContacts, parseVcf } from '../../services/contacts.service';
import {
  blockContact,
  unblockContact,
  getBlockedByUser,
  BlockedContact,
} from '../../services/block.service';
import { ApiResponse, ImportResult } from '../../types';
import { getSession } from '../../db/neo4j/client';
import pool from '../../db/postgres/client';

const contactsRouter = Router();

contactsRouter.use(authenticateJwt);
contactsRouter.use(requireSubscription);
contactsRouter.use(captureDeviceFingerprint);

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

contactsRouter.post(
  '/block',
  body('phone').isString().trim().notEmpty().withMessage('phone is required'),
  async (req: Request, res: Response<ApiResponse<null>>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: errors
          .array()
          .map((e) => e.msg)
          .join(', '),
      });
      return;
    }
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const { phone } = req.body as { phone: string };
      await blockContact(userId, phone);
      res.status(200).json({ success: true, data: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ბლოკვა ვერ მოხერხდა';
      res.status(500).json({ success: false, error: message });
    }
  },
);

contactsRouter.delete(
  '/block',
  body('phone').isString().trim().notEmpty().withMessage('phone is required'),
  async (req: Request, res: Response<ApiResponse<null>>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: errors
          .array()
          .map((e) => e.msg)
          .join(', '),
      });
      return;
    }
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const { phone } = req.body as { phone: string };
      await unblockContact(userId, phone);
      res.status(200).json({ success: true, data: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'განბლოკვა ვერ მოხერხდა';
      res.status(500).json({ success: false, error: message });
    }
  },
);

contactsRouter.get(
  '/blocked',
  async (req: Request, res: Response<ApiResponse<BlockedContact[]>>) => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const blocked = await getBlockedByUser(userId);
      res.status(200).json({ success: true, data: blocked });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'სია ვერ მოიძებნა';
      res.status(500).json({ success: false, error: message });
    }
  },
);

const MAX_FRIEND_PHONES_DIAG = 3000;

contactsRouter.get('/diag/second-degree', async (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).user.userId;
  const tagQuery = String(req.query['q'] ?? 'test');

  const t0 = Date.now();

  const phoneResult = await pool.query<{ phone: string }>(
    'SELECT phone FROM "UserPhone" WHERE "userId" = $1 LIMIT 1',
    [userId],
  );
  if (phoneResult.rows.length === 0) {
    res.status(404).json({ success: false, error: 'Phone not found for user' });
    return;
  }
  const userPhone = phoneResult.rows[0].phone;

  const neo4jSession = getSession();
  let friendPhones: string[] = [];
  try {
    const neo4jResult = await neo4jSession.run(
      `MATCH (me:AllyNode {phoneKey: $userPhone})-[:CONTACT]->(friend:AllyNode)
       RETURN DISTINCT friend.phoneKey AS phoneKey
       LIMIT ${MAX_FRIEND_PHONES_DIAG}`,
      { userPhone },
      { timeout: 10000 },
    );
    friendPhones = neo4jResult.records
      .map((r) => r.get('phoneKey') as string | null)
      .filter((p): p is string => p !== null);
  } finally {
    await neo4jSession.close();
  }

  const t1 = Date.now();

  const registeredResult = await pool.query<{ userId: string; phone: string }>(
    'SELECT "userId", phone FROM "UserPhone" WHERE phone = ANY($1)',
    [friendPhones],
  );
  const registeredFriends = registeredResult.rows;

  const t2 = Date.now();

  const exactTerm = tagQuery.toLowerCase();
  const likeTerm = '%' + exactTerm + '%';

  let pgRows: unknown[] = [];
  let pgError: string | null = null;
  try {
    const pgResult = await pool.query<{ phone: string; name: string | null }>(
      `WITH friend_users AS (
         SELECT up."userId", up.phone AS via_phone
         FROM "UserPhone" up
         WHERE up.phone = ANY($2)
       ),
       tag_hits AS (
         SELECT ut.phone, ut."contactId"
         FROM "UserTags" ut
         JOIN friend_users fu ON fu."userId" = ut."contactId"
         WHERE LOWER(ut.tag) = ANY($3)
       ),
       alias_hits AS (
         SELECT ua_m.phone, ua_m."contactId"
         FROM "UserAlias" ua_m
         JOIN friend_users fu ON fu."userId" = ua_m."contactId"
         WHERE LOWER(ua_m.alias) LIKE $4
       ),
       matches AS (
         SELECT phone, "contactId" FROM tag_hits
         UNION
         SELECT phone, "contactId" FROM alias_hits
       )
       SELECT DISTINCT ON (m.phone)
              m.phone,
              COALESCE(ua_t.alias, u_t.name) AS name
       FROM matches m
       JOIN friend_users fu ON fu."userId" = m."contactId"
       LEFT JOIN "UserAlias" ua_t ON ua_t.phone = m.phone AND ua_t."contactId" = m."contactId"
       LEFT JOIN "UserPhone" up_t ON up_t.phone = m.phone
       LEFT JOIN "User" u_t ON u_t.id = up_t."userId"
       LEFT JOIN "UserAlias" ua_own ON ua_own.phone = m.phone AND ua_own."contactId" = $1
       WHERE ua_own.phone IS NULL
       ORDER BY m.phone
       LIMIT 20`,
      [userId, friendPhones, [exactTerm], likeTerm],
    );
    pgRows = pgResult.rows;
  } catch (err) {
    pgError = (err as Error).message;
  }

  const t3 = Date.now();

  res.json({
    success: true,
    query: tagQuery,
    userPhone,
    timings_ms: {
      neo4j_fetch: t1 - t0,
      pg_registered_check: t2 - t1,
      pg_search: t3 - t2,
      total: t3 - t0,
    },
    friend_phones_from_neo4j: friendPhones.length,
    registered_ally_friends: registeredFriends.length,
    registered_friend_phones: registeredFriends.map((r) => r.phone),
    pg_results: pgRows,
    pg_error: pgError,
  });
});

export default contactsRouter;
