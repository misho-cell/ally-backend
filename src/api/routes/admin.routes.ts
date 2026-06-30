import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import {
  authenticateJwt,
  requireAdminRole,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { processAdminChat } from '../../services/adminChatService';
import {
  getInsightFields,
  getAllInsightFields,
  createInsightField,
  updateInsightField,
  toggleInsightField,
} from '../../services/insights.service';
import {
  ApiResponse,
  AnalyticsOverview,
  InsightField,
  UserListItem,
  UserProfile,
} from '../../types';
import { getOverview } from '../../services/analytics.service';
import { listUsers, getAdminUserDetail } from '../../services/adminUsers.service';
import { getSession } from '../../db/neo4j/client';
import pool from '../../db/postgres/client';
import {
  getAllEnabledTools,
  toggleEnabledTool,
  EnabledTool,
} from '../../services/enabledTools.service';
import { EnrichmentJob, JobStatus, JobType } from '../../services/enrichment.job';
import { getCompositeKeyForUser } from '../../services/neo4j.keys';
import { query } from '../../db/postgres/client';

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

adminRouter.get('/fields', async (req: Request, res: Response<ApiResponse<InsightField[]>>) => {
  try {
    const fields = await getAllInsightFields();
    res.status(200).json({ success: true, data: fields });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

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
  body('message').isString().trim().notEmpty().isLength({ max: 100_000 }),
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

adminRouter.get('/tools', async (_req: Request, res: Response<ApiResponse<EnabledTool[]>>) => {
  try {
    const tools = await getAllEnabledTools();
    res.status(200).json({ success: true, data: tools });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.patch(
  '/tools/:key/toggle',
  param('key').isString().trim().notEmpty(),
  async (req: Request, res: Response<ApiResponse<EnabledTool>>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() } as never);
      return;
    }
    try {
      const tool = await toggleEnabledTool(req.params.key as string);
      res.status(200).json({ success: true, data: tool });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

adminRouter.get('/diag/neo4j-second-degree', async (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).user.userId;
  let userKey: string;
  try {
    userKey = await getCompositeKeyForUser(Number(userId));
  } catch {
    res.status(404).json({ success: false, error: 'Phone not found for user' });
    return;
  }
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (me:AllyNode {phoneKey: $userKey})-[:CONTACT]->(friend:AllyNode)
       OPTIONAL MATCH (friend)-[:CONTACT]->(target:AllyNode)
       WHERE target.phoneKey <> me.phoneKey
       WITH friend, COUNT(DISTINCT target) AS friendContacts
       RETURN
         COUNT(friend)                                        AS total_friends_in_neo4j,
         COUNT(CASE WHEN friendContacts > 0 THEN friend END)  AS friends_with_contacts,
         SUM(friendContacts)                                  AS total_second_degree`,
      { userKey },
      { timeout: 15000 },
    );
    const row = result.records[0];
    res.json({
      success: true,
      userKey,
      total_friends_in_neo4j:
        row.get('total_friends_in_neo4j').toNumber?.() ?? row.get('total_friends_in_neo4j'),
      friends_with_contacts:
        row.get('friends_with_contacts').toNumber?.() ?? row.get('friends_with_contacts'),
      total_second_degree:
        row.get('total_second_degree').toNumber?.() ?? row.get('total_second_degree'),
    });
  } finally {
    await session.close();
  }
});

const MAX_FRIEND_PHONES_DIAG = 300;

adminRouter.get('/diag/pg-second-degree', async (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).user.userId;
  const tagQuery = String(req.query['q'] ?? 'test');

  const t0 = Date.now();

  let userKey: string;
  try {
    userKey = await getCompositeKeyForUser(Number(userId));
  } catch {
    res.status(404).json({ success: false, error: 'Phone not found for user' });
    return;
  }

  const neo4jSession = getSession();
  let friendKeys: string[] = [];
  try {
    const neo4jResult = await neo4jSession.run(
      `MATCH (me:AllyNode {phoneKey: $userKey})-[:CONTACT]->(friend:AllyNode)
       RETURN DISTINCT friend.phoneKey AS phoneKey
       LIMIT ${MAX_FRIEND_PHONES_DIAG}`,
      { userKey },
      { timeout: 10000 },
    );
    friendKeys = neo4jResult.records
      .map((r) => r.get('phoneKey') as string | null)
      .filter((p): p is string => p !== null);
  } finally {
    await neo4jSession.close();
  }

  const friendPhones = [...new Set(friendKeys.flatMap((k) => k.split('-')))];

  const t1 = Date.now();

  const registeredResult = await pool.query<{ userId: string; phone: string }>(
    'SELECT "userId", phone FROM "UserPhone" WHERE phone = ANY($1)',
    [friendPhones],
  );
  const registeredFriends = registeredResult.rows;

  const t2 = Date.now();

  const searchTerm = '%' + tagQuery.toLowerCase() + '%';

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
         WHERE LOWER(ut.tag) LIKE $3
       ),
       alias_hits AS (
         SELECT ua_m.phone, ua_m."contactId"
         FROM "UserAlias" ua_m
         JOIN friend_users fu ON fu."userId" = ua_m."contactId"
         WHERE LOWER(ua_m.alias) LIKE $3
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
      [userId, friendPhones, searchTerm],
    );
    pgRows = pgResult.rows;
  } catch (err) {
    pgError = (err as Error).message;
  }

  const t3 = Date.now();

  res.json({
    success: true,
    query: tagQuery,
    userKey,
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

adminRouter.post(
  '/enrichment/start',
  body('type').isIn(['full', 'incremental', 'neo4j_backfill']).optional(),
  async (req: Request, res: Response<ApiResponse<{ jobId: string }>>) => {
    try {
      const jobType = ((req.body as { type?: string }).type ?? 'full') as JobType;
      const jobId = await EnrichmentJob.start(jobType);
      res.status(202).json({ success: true, data: { jobId } });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'სერვერის შეცდომა';
      res.status(409).json({ success: false, error: msg });
    }
  },
);

adminRouter.get(
  '/enrichment/status',
  async (_req: Request, res: Response<ApiResponse<JobStatus>>) => {
    try {
      const status = await EnrichmentJob.getStatus();
      res.status(200).json({ success: true, data: status });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

adminRouter.post(
  '/enrichment/stop',
  async (_req: Request, res: Response<ApiResponse<{ stopped: boolean }>>) => {
    try {
      await EnrichmentJob.stop();
      res.status(200).json({ success: true, data: { stopped: true } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

adminRouter.get(
  '/system-prompt',
  async (_req: Request, res: Response<ApiResponse<{ system_prompt: string }>>) => {
    try {
      const result = await query<{ system_prompt: string }>(
        'SELECT system_prompt FROM ai_config ORDER BY id DESC LIMIT 1',
      );
      const system_prompt = result.rows[0]?.system_prompt ?? '';
      res.status(200).json({ success: true, data: { system_prompt } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

adminRouter.put(
  '/system-prompt',
  body('system_prompt').isString().notEmpty(),
  async (req: Request, res: Response<ApiResponse<{ system_prompt: string }>>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() } as never);
      return;
    }
    try {
      const { system_prompt } = req.body as { system_prompt: string };
      await query('INSERT INTO ai_config (system_prompt) VALUES ($1)', [system_prompt]);
      res.status(200).json({ success: true, data: { system_prompt } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

adminRouter.get(
  '/analytics/overview',
  async (_req: Request, res: Response<ApiResponse<AnalyticsOverview>>) => {
    try {
      const overview = await getOverview();
      res.status(200).json({ success: true, data: overview });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Analytics overview error:', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

adminRouter.get('/users', async (req: Request, res: Response<ApiResponse<UserListItem[]>>) => {
  try {
    const q = typeof req.query['q'] === 'string' ? req.query['q'] : '';
    const limit = Number(req.query['limit'] ?? 0);
    const users = await listUsers(q, limit);
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('List users error:', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.get(
  '/users/:id',
  param('id').isInt({ min: 1 }),
  async (req: Request, res: Response<ApiResponse<UserProfile>>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() } as never);
      return;
    }
    try {
      const profile = await getAdminUserDetail(Number(req.params.id));
      if (!profile) {
        res.status(404).json({ success: false, error: 'მომხმარებელი ვერ მოიძებნა' });
        return;
      }
      res.status(200).json({ success: true, data: profile });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('User detail error:', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

export default adminRouter;
