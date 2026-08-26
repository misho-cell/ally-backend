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
import {
  listUsers,
  getAdminUserDetail,
  searchUsersByPhone,
  grantSubscription,
  deactivateSubscription,
  isGrantTier,
  AdminPhoneSearchRow,
} from '../../services/adminUsers.service';
import { recordProductEvent } from '../../services/productEvents.service';
import { getSession } from '../../db/neo4j/client';
import pool from '../../db/postgres/client';
import {
  getAllEnabledTools,
  toggleEnabledTool,
  EnabledTool,
} from '../../services/enabledTools.service';
import { EnrichmentJob, JobStatus, JobType } from '../../services/enrichment.job';
import { getCompositeKeyForUser } from '../../services/neo4j.keys';
import { getGraphDiagnostic, GraphDiagnostic } from '../../services/graphAnalytics.service';
import {
  reclassifyPrivateNotes,
  ReclassifyResult,
  retractFactsFromForeignSync,
} from '../../services/contactFacts.service';
import {
  listPromptBlocks,
  upsertPromptBlock,
  deletePromptBlock,
  getPromptBlockHistory,
  computeModeTotals,
  listRunStamps,
  isValidBlockName,
  isRunMode,
  PromptBlock,
  PromptBlockInput,
  PromptBlockHistoryEntry,
  PromptBlockValidationError,
  ModeTotal,
  RunStamp,
  RUN_MODES,
} from '../../services/promptBlocks.service';
import { buildPromptPreview, PromptPreview } from '../../services/chat.service';
import { getTaskById } from '../../services/taskStore.service';
import { wakeTask } from '../../services/taskEngine.service';
import { getThreadMessages } from '../../services/threads.service';
import { query } from '../../db/postgres/client';
import {
  getLabelQueue,
  getLabelQueueTotal,
  parsePhonebookLabelsForUser,
  reprocessLabelQueue,
} from '../../services/labelParser.service';
import { getReferralFunnel } from '../../services/referralLink.service';
import { backfillHumanRelationshipTiers } from '../../services/tools/relationshipScores';

const adminRouter = Router();

adminRouter.use(authenticateJwt, requireAdminRole);

// App flags an admin may flip from the console. Whitelist on purpose — a typo
// must not mint a brand-new (fail-open-read) flag row.
const MANAGED_APP_FLAGS = ['invite_only', 'invite_link_ready'] as const;

interface AppFlagRow {
  flag: string;
  enabled: boolean;
  updated_at: string;
}

adminRouter.get('/flags', async (req: Request, res: Response<ApiResponse<AppFlagRow[]>>) => {
  try {
    const result = await query<AppFlagRow>(
      `SELECT flag, enabled, updated_at FROM app_flags ORDER BY flag`,
      [],
    );
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.put(
  '/flags/:flag',
  param('flag')
    .isIn([...MANAGED_APP_FLAGS])
    .withMessage('unknown flag'),
  body('enabled').isBoolean().withMessage('enabled must be a boolean'),
  async (req: Request, res: Response<ApiResponse<AppFlagRow>>) => {
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
      const flag = String(req.params.flag);
      const { enabled } = req.body as { enabled: boolean };
      const result = await query<AppFlagRow>(
        `INSERT INTO app_flags (flag, enabled)
         VALUES ($1, $2)
         ON CONFLICT (flag) DO UPDATE SET enabled = $2, updated_at = NOW()
         RETURNING flag, enabled, updated_at`,
        [flag, enabled],
      );
      res.status(200).json({ success: true, data: result.rows[0] });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// Prompt blocks — the prompt team's own catalog: create/edit/reorder/trial/
// disable/delete blocks and their mode bindings, live on save, no deploy.
// Mode DETECTION stays code-side (see resolveRunMode in chat.service).
interface PromptBlocksListing {
  blocks: PromptBlock[];
  modes: readonly string[];
  mode_totals: ModeTotal[];
}

adminRouter.get(
  '/prompt-blocks',
  async (_req: Request, res: Response<ApiResponse<PromptBlocksListing>>) => {
    try {
      const blocks = await listPromptBlocks();
      res.status(200).json({
        success: true,
        data: { blocks, modes: RUN_MODES, mode_totals: computeModeTotals(blocks) },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

adminRouter.put(
  '/prompt-blocks/:name',
  body('content').optional().isString().isLength({ max: 20_000 }).withMessage('content too long'),
  body('modes').optional().isArray().withMessage('modes must be an array'),
  body('modes.*').optional().isString(),
  body('sort_order').optional().isInt({ min: 0, max: 100_000 }),
  body('enabled').optional().isBoolean(),
  body('enabled_for_user_ids').optional().isArray(),
  body('enabled_for_user_ids.*').optional().isInt({ min: 1 }),
  async (req: Request, res: Response<ApiResponse<PromptBlock>>) => {
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
    const name = String(req.params.name);
    if (!isValidBlockName(name)) {
      res.status(400).json({ success: false, error: 'name must match [a-z0-9_]{2,40}' });
      return;
    }
    try {
      const input = req.body as PromptBlockInput;
      res.status(200).json({ success: true, data: await upsertPromptBlock(name, input) });
    } catch (error) {
      if (error instanceof PromptBlockValidationError) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      // eslint-disable-next-line no-console
      console.error(error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

adminRouter.delete(
  '/prompt-blocks/:name',
  async (req: Request, res: Response<ApiResponse<{ deleted: boolean }>>) => {
    const name = String(req.params.name);
    if (!isValidBlockName(name)) {
      res.status(400).json({ success: false, error: 'name must match [a-z0-9_]{2,40}' });
      return;
    }
    try {
      const deleted = await deletePromptBlock(name);
      if (!deleted) {
        res.status(404).json({ success: false, error: 'ბლოკი ვერ მოიძებნა' });
        return;
      }
      res.status(200).json({ success: true, data: { deleted: true } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

adminRouter.get(
  '/prompt-blocks/:name/history',
  async (req: Request, res: Response<ApiResponse<PromptBlockHistoryEntry[]>>) => {
    const name = String(req.params.name);
    if (!isValidBlockName(name)) {
      res.status(400).json({ success: false, error: 'name must match [a-z0-9_]{2,40}' });
      return;
    }
    try {
      res.status(200).json({ success: true, data: await getPromptBlockHistory(name) });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// The assembled prompt EXACTLY as a run in ?mode= would receive it — base,
// blocks in order, code-built sections, plus every enabled tool's description.
// ?user_id= defaults to PREVIEW_DEFAULT_USER_ID (the account the team tests on).
adminRouter.get(
  '/prompt-preview',
  async (req: Request, res: Response<ApiResponse<PromptPreview>>) => {
    const mode = String(req.query['mode'] ?? '');
    if (!isRunMode(mode)) {
      res
        .status(400)
        .json({ success: false, error: `mode must be one of: ${RUN_MODES.join(', ')}` });
      return;
    }
    const rawUserId = String(req.query['user_id'] ?? process.env['PREVIEW_DEFAULT_USER_ID'] ?? '');
    if (!/^\d+$/.test(rawUserId)) {
      res.status(400).json({
        success: false,
        error: 'user_id query param required (or set PREVIEW_DEFAULT_USER_ID)',
      });
      return;
    }
    try {
      res.status(200).json({ success: true, data: await buildPromptPreview(rawUserId, mode) });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// Which mode each recent run resolved to and which blocks it loaded
// (?thread_id= narrows to one conversation).
adminRouter.get('/run-modes', async (req: Request, res: Response<ApiResponse<RunStamp[]>>) => {
  const rawThread = req.query['thread_id'];
  const threadId =
    typeof rawThread === 'string' && /^\d+$/.test(rawThread) ? Number(rawThread) : undefined;
  try {
    res.status(200).json({ success: true, data: await listRunStamps(threadId) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

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

// Backfill: run a user's existing PRIVATE free-form notes through the same
// agent moderation new saves get, publishing the clearly-professional ones.
// Synchronous but capped (`max`, default 150 notes ≈ a few minutes) — returns
// counts; remaining=1 means call again to continue.
adminRouter.post(
  '/facts/reclassify',
  body('user_id').isInt({ min: 1 }).withMessage('user_id must be a positive integer'),
  body('max').optional().isInt({ min: 1, max: 2000 }),
  async (req: Request, res: Response<ApiResponse<ReclassifyResult>>) => {
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
      const { user_id, max } = req.body as { user_id: number; max?: number };
      const result = await reclassifyPrivateNotes(String(user_id), max);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// Ticket 6 P0 (25 Aug), Task 2: retract contact_facts the label parser wrote
// from a foreign contact sync's labels, filed as the contaminated account's
// own submissions. Synchronous — the scoped query is a handful of rows, not
// a bulk job (contrast /label-parser/reprocess-queue). General on any
// (contaminated, sync source) pair, since Task 4 of the same round asks
// whether other accounts carry the same kind of sync.
adminRouter.post(
  '/facts/retract-foreign-sync',
  body('contaminated_user_id').isInt({ min: 1 }),
  body('sync_source_user_id').isInt({ min: 1 }),
  async (req: Request, res: Response<ApiResponse<{ retracted: number }>>) => {
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
      const { contaminated_user_id, sync_source_user_id } = req.body as {
        contaminated_user_id: number;
        sync_source_user_id: number;
      };
      const result = await retractFactsFromForeignSync(
        String(contaminated_user_id),
        String(sync_source_user_id),
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[admin retract-foreign-sync]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
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
    const subscribedOnly = req.query['subscribed'] === 'true';
    const users = await listUsers(q, limit, subscribedOnly);
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('List users error:', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Find a user by phone, any spelling — digits are compared as a suffix so
// "+995 598 85 20 80", "598852080" and "0598852080" all find the same person.
// Registered BEFORE /users/:id so 'search' never falls into the :id matcher.
adminRouter.get(
  '/users/search',
  async (req: Request, res: Response<ApiResponse<AdminPhoneSearchRow[]>>) => {
    try {
      const phone = typeof req.query['phone'] === 'string' ? req.query['phone'] : '';
      if (phone.replace(/\D/g, '').length < 6) {
        res.status(400).json({ success: false, error: 'phone: მინიმუმ 6 ციფრი' });
        return;
      }
      const users = await searchUsersByPhone(phone);
      res.status(200).json({ success: true, data: users });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[admin user search]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// Manual premium switch: grant a tier for N days, or deactivate. Every change
// is audited — who did it, to whom, what — in product_events and the log.
const GRANT_DEFAULT_DAYS = 30;
const GRANT_MAX_DAYS = 365;

adminRouter.post(
  '/users/:id/subscription',
  param('id').isInt({ min: 1 }),
  body('action').optional().isIn(['grant', 'deactivate']),
  body('tier').optional().isString(),
  body('days').optional().isInt({ min: 1, max: GRANT_MAX_DAYS }),
  async (req: Request, res: Response<ApiResponse<AdminPhoneSearchRow>>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'არასწორი პარამეტრები' });
      return;
    }
    try {
      const targetId = Number(req.params.id);
      const adminId = (req as AuthenticatedRequest).user.userId;
      const action = String((req.body as { action?: string }).action ?? 'grant');

      if (action === 'deactivate') {
        const updated = await deactivateSubscription(targetId);
        if (!updated) {
          res.status(404).json({ success: false, error: 'მომხმარებელი ვერ მოიძებნა' });
          return;
        }
        void recordProductEvent(adminId, 'admin_subscription_change', {
          action: 'deactivate',
          target_user_id: targetId,
        });
        // eslint-disable-next-line no-console
        console.log(`[admin-sub] admin ${adminId} deactivated user ${targetId}`);
        res.status(200).json({ success: true, data: updated });
        return;
      }

      const tier = String((req.body as { tier?: string }).tier ?? '');
      if (!isGrantTier(tier)) {
        res.status(400).json({ success: false, error: 'tier: pro ან enterprise' });
        return;
      }
      const days = Number((req.body as { days?: number }).days ?? GRANT_DEFAULT_DAYS);
      const updated = await grantSubscription(targetId, tier, days);
      if (!updated) {
        res.status(404).json({ success: false, error: 'მომხმარებელი ვერ მოიძებნა' });
        return;
      }
      void recordProductEvent(adminId, 'admin_subscription_change', {
        action: 'grant',
        target_user_id: targetId,
        tier,
        days,
      });
      // eslint-disable-next-line no-console
      console.log(`[admin-sub] admin ${adminId} granted ${tier}/${days}d to user ${targetId}`);
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[admin subscription]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

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

// Fire a task's wake NOW instead of waiting for next_wake_at — the tester's
// fast-forward (every multi-day goal behavior is otherwise unobservable) and
// production's rescue lever for a stuck goal. Works on any user's open task.
adminRouter.post(
  '/tasks/:id/wake',
  param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
  async (req: Request, res: Response<ApiResponse<{ woken: boolean }>>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'id must be a positive integer' });
      return;
    }
    try {
      const taskId = Number(req.params.id);
      const task = await getTaskById(taskId);
      if (!task) {
        res.status(404).json({ success: false, error: 'დავალება ვერ მოიძებნა' });
        return;
      }
      if (task.status !== 'open') {
        res.status(409).json({ success: false, error: `დავალება ${task.status}-სტატუსშია` });
        return;
      }
      await wakeTask(
        taskId,
        'ადმინმა ხელით გააღვიძა დავალება — გააგრძელე მუშაობა გეგმის მიხედვით.',
      );
      res.status(200).json({ success: true, data: { woken: true } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[admin wake]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// Read ANY thread's messages — the tester's window into the incoming_ask
// surface (checking the exact message that landed on a consenting recipient's
// phone, word for word). Admin-only by the router guard above.
adminRouter.get(
  '/threads/:id/messages',
  param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'id must be a positive integer' });
      return;
    }
    try {
      const threadId = Number(req.params.id);
      const threadResult = await query<{
        id: number;
        user_id: number;
        type: string;
        title: string | null;
        status: string;
        created_at: string;
      }>(`SELECT id, user_id, type, title, status, created_at FROM threads WHERE id = $1`, [
        threadId,
      ]);
      if (threadResult.rows.length === 0) {
        res.status(404).json({ success: false, error: 'thread ვერ მოიძებნა' });
        return;
      }
      const messages = await getThreadMessages(threadId, { includeSteps: true });
      res.status(200).json({ success: true, data: { thread: threadResult.rows[0], messages } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[admin thread read]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// The ask log (tester register T2-02, requested three times): every ask ever
// sent, with its delivery state — the only way to reconstruct what a user
// actually received when two surfaces disagree. Newest first; ?limit= and
// ?task_id= / ?user_id= narrow it.
adminRouter.get('/asks', async (req: Request, res: Response) => {
  try {
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 100;
    const taskId = Number.isFinite(Number(req.query.task_id)) ? Number(req.query.task_id) : null;
    const userId = Number.isFinite(Number(req.query.user_id)) ? Number(req.query.user_id) : null;
    const result = await query(
      `SELECT ta.id, ta.task_id, ta.parent_ask_id,
              ta.from_user_id, fu.name AS from_name,
              ta.to_user_id, tu.name AS to_name,
              ta.status, ta.question, ta.answer, ta.ask_thread_id,
              ta.created_at, ta.answered_at, ta.reminded_at, ta.wake_delivered_at
       FROM task_asks ta
       LEFT JOIN "User" fu ON fu.id = ta.from_user_id
       LEFT JOIN "User" tu ON tu.id = ta.to_user_id
       WHERE ($1::int IS NULL OR ta.task_id = $1::int)
         AND ($2::int IS NULL OR ta.from_user_id = $2::int OR ta.to_user_id = $2::int)
       ORDER BY ta.id DESC
       LIMIT $3::int`,
      [taskId, userId, limit],
    );
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin asks log]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Recompute one account's relationship scores NOW (ticket 4 items 4B.2/4B.5):
// the explicit-insight override applies to new saves immediately, but scores
// computed before the fix stay wrong until re-scored — this runs the same pass
// the nightly job would, on demand, so a verification does not wait a day.
adminRouter.post('/enrichment/rescore', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.query.user_id);
    if (!Number.isFinite(userId) || userId <= 0) {
      res.status(400).json({ success: false, error: 'user_id აუცილებელია' });
      return;
    }
    // 202 + background: a full account takes minutes (the founder's ~2,700
    // contacts each need a graph bidirectionality check) and a synchronous run
    // outlived every browser timeout (ticket 5 item C2's operational ask).
    const { getCompositeKeyForUser } = await import('../../services/neo4j.keys');
    const { computeAndSaveUserScores } = await import('../../services/enrichment.service');
    const userKey = await getCompositeKeyForUser(userId);
    void computeAndSaveUserScores(userId, userKey)
      .then(() =>
        // eslint-disable-next-line no-console
        console.log(`[rescore] user ${userId} done`),
      )
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error(`[rescore] user ${userId} FAILED:`, (err as Error).message),
      );
    res.status(202).json({
      success: true,
      data: {
        rescoring_user: userId,
        note: 'მიმდინარეობს ფონურად (რამდენიმე წუთი დიდ ექაუნთზე) — დასრულება Railway-ს ლოგში ჩანს: [rescore] user N done',
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin rescore]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Engine T2 (ticket 6, task 29): the phonebook-label parser's ambiguity
// queue — labels it could not resolve into a starter fact, so nothing a
// user wrote is silently dropped.
adminRouter.get('/label-queue', async (req: Request, res: Response) => {
  try {
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 100;
    // Live-caught twice: a field called "count" next to a field called
    // "total" reads as "the real number" either way, and got read as the
    // queue's true size at 500 (this page's row cap) when the real figure
    // was 2,277. Dropping "count" entirely — "returned" can't be mistaken
    // for "total" the way "count" could.
    const [entries, total] = await Promise.all([getLabelQueue(limit), getLabelQueueTotal()]);
    res.status(200).json({ success: true, data: { total, returned: entries.length, entries } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin label-queue]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Backfill: run the label parser over one existing user's already-imported
// phonebook (new users get this automatically on import; this covers
// everyone who imported before the parser existed).
adminRouter.post('/label-parser/backfill', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.query.user_id);
    if (!Number.isFinite(userId) || userId <= 0) {
      res.status(400).json({ success: false, error: 'user_id აუცილებელია' });
      return;
    }
    void parsePhonebookLabelsForUser(String(userId))
      .then((result) =>
        // eslint-disable-next-line no-console
        console.log(`[label-parser] user ${userId} done: ${JSON.stringify(result)}`),
      )
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error(`[label-parser] user ${userId} FAILED:`, (err as Error).message),
      );
    res.status(202).json({
      success: true,
      data: {
        parsing_user: userId,
        note: 'მიმდინარეობს ფონურად — დასრულება Railway-ს ლოგში ჩანს: [label-parser] user N done',
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin label-parser backfill]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Catch-up pass: re-evaluate rows already SITTING in label_parse_queue
// against today's dictionary and word-count rule — the backfill above only
// looks at phones with neither a fact nor a queue row yet, so a dictionary
// fix shipped after a phone was already queued never reaches it on its own.
// ?user_id= scopes to one account; omit to sweep the whole queue.
adminRouter.post('/label-parser/reprocess-queue', async (req: Request, res: Response) => {
  try {
    const rawUserId = req.query.user_id;
    const userId = typeof rawUserId === 'string' && /^\d+$/.test(rawUserId) ? rawUserId : undefined;
    void reprocessLabelQueue(userId)
      .then((result) =>
        // eslint-disable-next-line no-console
        console.log(`[label-parser reprocess] ${userId ?? 'ALL'} done: ${JSON.stringify(result)}`),
      )
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error(
          `[label-parser reprocess] ${userId ?? 'ALL'} FAILED:`,
          (err as Error).message,
        ),
      );
    res.status(202).json({
      success: true,
      data: {
        reprocessing: userId ?? 'all',
        note: 'მიმდინარეობს ფონურად — დასრულება Railway-ს ლოგში ჩანს: [label-parser reprocess] ... done',
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin label-parser reprocess]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Engine T3: sent → opened → registered, for one user or the whole product
// (?user_id= narrows it) — the three events the spec asked to see in
// analytics.
adminRouter.get('/referral-funnel', async (req: Request, res: Response) => {
  try {
    const rawUserId = req.query.user_id;
    const userId = typeof rawUserId === 'string' && /^\d+$/.test(rawUserId) ? rawUserId : undefined;
    const funnel = await getReferralFunnel(userId);
    res.status(200).json({ success: true, data: funnel });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin referral-funnel]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Engine T4: the old-Ally colour backfill (migration 080's table, populated
// here rather than in the migration itself — that INSERT, run as one
// statement inside the migration's transaction, exceeded the default pool's
// 8s statement_timeout and crash-looped the app on 25 Aug). Batched, on the
// dedicated background pool (30s timeout per query); idempotent, safe to
// re-run or re-trigger if it's interrupted partway through.
adminRouter.post('/relationship-tiers/backfill', async (_req: Request, res: Response) => {
  try {
    void backfillHumanRelationshipTiers()
      .then((result) =>
        // eslint-disable-next-line no-console
        console.log(`[relationship-tiers backfill] done: ${JSON.stringify(result)}`),
      )
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[relationship-tiers backfill] FAILED:', (err as Error).message),
      );
    res.status(202).json({
      success: true,
      data: {
        note: 'მიმდინარეობს ფონურად (რამდენიმე წუთი) — დასრულება Railway-ს ლოგში ჩანს: [relationship-tiers backfill] done',
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin relationship-tiers backfill]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// The assistant's product self-knowledge (netai_info) — owned by the prompt
// team, edited here without a deploy, read verbatim by get_netai_info.
// PART H's first observable (ticket 6 close, task 5): proves migration 061 is
// live and shows what the question bank holds. The tester's 48 rows load here;
// POST accepts them as a JSON array (insert-or-update by question_id).
adminRouter.get('/question-bank', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT question_id, category, surface, prompt_ka, prompt_es, prompt_en,
              options, signals, score_vector, immediate_use, immediate_use_ka,
              immediate_use_es, storage_level, follow_up_rule, select_mode,
              select_max, goal_bound, scoring_note, active, updated_at
       FROM question_bank ORDER BY question_id`,
    );
    // `data` is the bare row array — same shape as GET /admin/netai-info,
    // which this editor page's UI was built against. The nested
    // { count, rows } shape this endpoint shipped with first is why the
    // page rendered "no questions found" while the request itself
    // succeeded with all 43 rows.
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin question-bank list]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

interface QuestionRow {
  question_id: string;
  category: string;
  surface?: string;
  prompt_ka: string;
  prompt_es?: string | null;
  prompt_en?: string | null;
  options?: unknown;
  signals?: string[];
  score_vector?: unknown;
  immediate_use: string;
  immediate_use_ka?: string | null;
  immediate_use_es?: string | null;
  storage_level?: string;
  follow_up_rule?: string | null;
  select_mode?: string;
  select_max?: number | null;
  goal_bound?: boolean;
  scoring_note?: string | null;
  active?: boolean;
}

adminRouter.post('/question-bank', async (req: Request, res: Response) => {
  try {
    const rows = Array.isArray(req.body) ? (req.body as QuestionRow[]) : null;
    if (!rows || rows.length === 0) {
      res.status(400).json({ success: false, error: 'გადმოეცი კითხვების JSON მასივი' });
      return;
    }
    let upserted = 0;
    for (const row of rows) {
      if (!row.question_id?.trim() || !row.category?.trim() || !row.prompt_ka?.trim()) {
        res.status(400).json({
          success: false,
          error: `question_id, category და prompt_ka აუცილებელია (გაჩერდა: ${row.question_id ?? '?'})`,
        });
        return;
      }
      await query(
        `INSERT INTO question_bank
           (question_id, category, surface, prompt_ka, prompt_es, prompt_en, options,
            signals, score_vector, immediate_use, immediate_use_ka, immediate_use_es,
            storage_level, follow_up_rule, select_mode, select_max, goal_bound,
            scoring_note, active)
         VALUES ($1, $2, COALESCE($3, 'any'), $4, $5, $6, COALESCE($7::jsonb, '[]'),
                 COALESCE($8, '{}'), COALESCE($9::jsonb, '{}'), $10, $11, $12,
                 COALESCE($13, 'raw+normalized'), $14, COALESCE($15, 'single'), $16,
                 COALESCE($17, false), $18, COALESCE($19, true))
         ON CONFLICT (question_id) DO UPDATE SET
           category = EXCLUDED.category, surface = EXCLUDED.surface,
           prompt_ka = EXCLUDED.prompt_ka, prompt_es = EXCLUDED.prompt_es,
           prompt_en = EXCLUDED.prompt_en, options = EXCLUDED.options,
           signals = EXCLUDED.signals, score_vector = EXCLUDED.score_vector,
           immediate_use = EXCLUDED.immediate_use,
           immediate_use_ka = EXCLUDED.immediate_use_ka,
           immediate_use_es = EXCLUDED.immediate_use_es,
           storage_level = EXCLUDED.storage_level,
           follow_up_rule = EXCLUDED.follow_up_rule,
           select_mode = EXCLUDED.select_mode, select_max = EXCLUDED.select_max,
           goal_bound = EXCLUDED.goal_bound, scoring_note = EXCLUDED.scoring_note,
           active = EXCLUDED.active,
           updated_at = NOW()`,
        [
          row.question_id.trim(),
          row.category.trim(),
          row.surface ?? null,
          row.prompt_ka,
          row.prompt_es ?? null,
          row.prompt_en ?? null,
          row.options === undefined ? null : JSON.stringify(row.options),
          row.signals ?? null,
          row.score_vector === undefined ? null : JSON.stringify(row.score_vector),
          row.immediate_use,
          row.immediate_use_ka ?? null,
          row.immediate_use_es ?? null,
          row.storage_level ?? null,
          row.follow_up_rule ?? null,
          row.select_mode ?? null,
          row.select_max ?? null,
          row.goal_bound ?? null,
          row.scoring_note ?? null,
          row.active ?? null,
        ],
      );
      upserted++;
    }
    res.status(200).json({ success: true, data: { upserted } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin question-bank post]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Single-question editor, the netai-info page's exact shape (task 25 build
// list item 2): GET the list, open one, PATCH what changed, save.
//
// Only a column whose key is actually PRESENT in the request body is
// touched — omitted keys leave their column alone, and a key sent as
// `null` clears it. This used to be COALESCE($n, column), which collapses
// "not sent" and "sent as null" into the same no-op: a save meant to clear
// a field (e.g. immediate_use_ka) silently kept the old value and still
// returned 200. Column names below come only from this fixed whitelist,
// never from the request body, so they're safe to interpolate; every
// value stays parameterized.
const QUESTION_BANK_EDITABLE_COLUMNS = [
  'category',
  'surface',
  'prompt_ka',
  'prompt_es',
  'prompt_en',
  'options',
  'signals',
  'score_vector',
  'immediate_use',
  'immediate_use_ka',
  'immediate_use_es',
  'storage_level',
  'follow_up_rule',
  'select_mode',
  'select_max',
  'goal_bound',
  'scoring_note',
  'active',
] as const;

const QUESTION_BANK_JSON_COLUMNS = new Set<string>(['options', 'score_vector']);

adminRouter.put('/question-bank/:question_id', async (req: Request, res: Response) => {
  try {
    const questionId = String(req.params.question_id ?? '').trim();
    if (!questionId) {
      res.status(400).json({ success: false, error: 'question_id აუცილებელია' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const setClauses: string[] = [];
    const params: unknown[] = [questionId];
    for (const column of QUESTION_BANK_EDITABLE_COLUMNS) {
      if (!Object.prototype.hasOwnProperty.call(body, column)) continue;
      const raw = body[column];
      const isJsonColumn = QUESTION_BANK_JSON_COLUMNS.has(column);
      params.push(isJsonColumn && raw !== null ? JSON.stringify(raw) : raw);
      setClauses.push(`${column} = $${params.length}${isJsonColumn ? '::jsonb' : ''}`);
    }
    if (setClauses.length === 0) {
      res.status(400).json({ success: false, error: 'შესაცვლელი ველი არ გამოგზავნილა' });
      return;
    }
    const result = await query<{ question_id: string; updated_at: string }>(
      `UPDATE question_bank SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE question_id = $1
       RETURNING question_id, updated_at`,
      params,
    );
    if (result.rowCount === 0) {
      res.status(404).json({ success: false, error: 'ეს question_id არ არსებობს' });
      return;
    }
    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin question-bank put]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.get('/netai-info', async (req: Request, res: Response) => {
  try {
    const result = await query('SELECT topic, content, updated_at FROM netai_info ORDER BY topic');
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin netai-info list]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.put('/netai-info/:topic', async (req: Request, res: Response) => {
  try {
    const topic = String(req.params.topic ?? '')
      .trim()
      .toLowerCase();
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!topic || !content) {
      res.status(400).json({ success: false, error: 'topic და content აუცილებელია' });
      return;
    }
    await query(
      `INSERT INTO netai_info (topic, content) VALUES ($1, $2)
       ON CONFLICT (topic) DO UPDATE SET content = $2, updated_at = NOW()`,
      [topic, content],
    );
    res.status(200).json({ success: true, data: { topic } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin netai-info put]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Introduction requests, same shape as /admin/asks (ticket 5 item G3: intro
// declines were observable nowhere admin-side).
adminRouter.get('/intro-requests', async (req: Request, res: Response) => {
  try {
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 100;
    const userId = Number.isFinite(Number(req.query.user_id)) ? Number(req.query.user_id) : null;
    const result = await query(
      `SELECT ir.id, ir.request_ref, ir.status, ir.target_name, ir.message,
              ir.mediator_response, ir.ask_type, ir.snoozed_until,
              ir.requester_user_id, rq.name AS requester_name,
              ir.mediator_user_id, md.name AS mediator_name,
              ir.created_at, ir.responded_at
       FROM introduction_requests ir
       LEFT JOIN "User" rq ON rq.id = ir.requester_user_id
       LEFT JOIN "User" md ON md.id = ir.mediator_user_id
       WHERE ($1::int IS NULL OR ir.requester_user_id = $1::int OR ir.mediator_user_id = $1::int)
       ORDER BY ir.id DESC
       LIMIT $2::int`,
      [userId, limit],
    );
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin intro log]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// One pass over existing thread titles with the SAME sanitiser new titles get
// (ticket 5 item B3: the old malformed titles were never backfilled). A title
// the sanitiser rejects outright (e.g. Cyrillic drift) falls back to the
// thread's first user message. Idempotent; capped per call.
adminRouter.post('/titles/cleanup', async (req: Request, res: Response) => {
  try {
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 2000) : 500;
    const { sanitizeTitle } = await import('../../services/threadTitle.service');
    const threads = await query<{ id: number; title: string }>(
      `SELECT id, title FROM threads WHERE title IS NOT NULL ORDER BY id DESC LIMIT $1::int`,
      [limit],
    );
    let updated = 0;
    for (const row of threads.rows) {
      const cleaned = sanitizeTitle(row.title);
      let next: string | null = cleaned;
      if (next === null) {
        const firstMsg = await query<{ content: string }>(
          `SELECT content FROM conversations
           WHERE thread_id = $1 AND role = 'user' AND kind = 'message' AND content <> ''
           ORDER BY created_at ASC LIMIT 1`,
          [row.id],
        );
        next = firstMsg.rows[0]?.content.slice(0, 60) ?? null;
      }
      if (next !== null && next !== row.title) {
        await query(`UPDATE threads SET title = $1 WHERE id = $2`, [next, row.id]);
        updated += 1;
      }
    }
    res.status(200).json({ success: true, data: { scanned: threads.rows.length, updated } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin title cleanup]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// WHY is this phone in this user's results (ticket 4 item 4B.1: "ownership on
// the Basilaia record is still direct")? ownership: 'direct' means the phone
// is in the user's own mine-set — this shows the exact rows that put it there:
// the user's own alias/tag rows, everyone's facts, the relationship score.
adminRouter.get('/contact-provenance', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.query.user_id);
    const phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : '';
    if (!Number.isFinite(userId) || userId <= 0 || phone === '') {
      res.status(400).json({ success: false, error: 'user_id და phone აუცილებელია' });
      return;
    }
    const digits = phone.replace(/\D/g, '');
    const [aliases, tags, facts, score, registered] = await Promise.all([
      query(
        `SELECT id, phone, alias FROM "UserAlias"
         WHERE "contactId" = $1 AND regexp_replace(phone, '\\D', '', 'g') = $2`,
        [userId, digits],
      ),
      query(
        `SELECT id, phone, tag FROM "UserTags"
         WHERE "contactId" = $1 AND regexp_replace(phone, '\\D', '', 'g') = $2`,
        [userId, digits],
      ),
      query(
        `SELECT id, submitted_by_user_id, field_type, value, retracted_at, created_at
         FROM contact_facts WHERE regexp_replace(neo4j_contact_id, '\\D', '', 'g') = $1
         ORDER BY created_at DESC LIMIT 50`,
        [digits],
      ),
      query(
        `SELECT relationship_type, strength_score, signals, computed_at
         FROM contact_relationship_scores
         WHERE user_id = $1 AND regexp_replace(contact_phone, '\\D', '', 'g') = $2`,
        [userId, digits],
      ),
      query(
        `SELECT up."userId", u.name FROM "UserPhone" up
         JOIN "User" u ON u.id = up."userId"
         WHERE regexp_replace(up.phone, '\\D', '', 'g') = $1 AND u."deletedAt" IS NULL`,
        [digits],
      ),
    ]);
    res.status(200).json({
      success: true,
      data: {
        in_mine_set: aliases.rows.length > 0 || tags.rows.length > 0,
        own_aliases: aliases.rows,
        own_tags: tags.rows,
        facts: facts.rows,
        relationship_score: score.rows[0] ?? null,
        registered_as: registered.rows[0] ?? null,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin contact-provenance]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// One-off validation for the graph tools: confirms which phoneKey form a real
// account uses and returns a raw top-connectors sample. Admin-only, read-only.
adminRouter.get(
  '/graph-diagnostic',
  async (req: Request, res: Response<ApiResponse<GraphDiagnostic>>) => {
    const phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : '';
    if (!phone) {
      res.status(400).json({ success: false, error: 'phone query param is required' });
      return;
    }
    try {
      const result = await getGraphDiagnostic(phone);
      if ('error' in result) {
        res.status(404).json({ success: false, error: result.error });
        return;
      }
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('graph-diagnostic error:', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

export default adminRouter;
