import { hideGoals, unhideGoal, hiddenGoals } from '../../services/taskStore.service';
import {
  createTestSeat,
  createdTestSeats,
  isOperableTestSeat,
  SeatCreationRefused,
  DEFAULT_SEAT_TOKENS,
  firstFreeFictionalPhone,
  inviterSeatPhone,
  inviterSeatReferralCode,
  isFictionalSlot,
  renameTestSeat,
} from '../../services/testSeatCreate.service';
import {
  fictionalTestAccountIds,
  isFictionalTestAccount,
  mintTestSeatToken,
  NotATestAccountError,
} from '../../services/testSeatTokens';
import {
  adjustTestAccountTokens,
  getBalance,
  MAX_ADMIN_TOKEN_ADJUSTMENT,
  TokenAdjustmentOutOfRange,
} from '../../services/tokenWallet.service';
import { randomUUID } from 'crypto';
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
  setAdminAccess,
  AdminAccessRow,
  setAdminPassword,
  MIN_ADMIN_PASSWORD_CHARS,
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
  retractFactsByRange,
  retypeFact,
  retractFactById,
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
  MAX_BLOCK_CONTENT_CHARS,
  BLOCK_TOO_LONG_MESSAGE,
} from '../../services/promptBlocks.service';
import { buildPromptPreview, PromptPreview } from '../../services/chat.service';
import { getTaskById } from '../../services/taskStore.service';
import { wakeTask } from '../../services/taskEngine.service';
import {
  getThreadMessages,
  getThreadsForUser,
  moveThreads,
  threadIdsCreatedOn,
} from '../../services/threads.service';
import { getToolCallsForThread } from '../../services/toolCallLog.service';
import { getOrCreateReferralCode } from '../../services/referralCode.service';
import { query } from '../../db/postgres/client';
import { removeContactFromNetwork } from '../../services/tools/removeContactFromNetwork';
import { pilotPeople, pilotReport } from '../../services/pilotReport.service';
import { subscriptionDrift } from '../../services/stripeReconcile.service';
import {
  INVITE_FREE_DAYS_FLAG,
  INVITE_FREE_DAYS_SETTING,
  MAX_INVITE_FREE_DAYS,
  writeSetting,
} from '../../services/inviteReward.service';
import {
  checkRegistrationEligibility,
  LOGIN_INVITE_ONLY_FLAG,
  PERSONAL_CODE_ONLY_FLAG,
} from '../../services/inviteGate.service';
import { loginGateVerdict } from '../../services/auth.service';
import {
  backfillCandidateNameReach,
  runIdentityScan,
  listIdentityCandidates,
  approveIdentityCandidate,
  rejectIdentityCandidate,
  undoCandidateDecision,
  unmergePerson,
  getIdentitySummary,
  getIdentityTotals,
  exportIdentityCandidates,
  applyIdentityDecisions,
  RarityBand,
} from '../../services/identity.service';
import { adminListGoals, retractGoalQuestion } from '../../services/goalQuestions.service';
import { adminGoalDetail, goalDays } from '../../services/goalDashboard.service';
import {
  deletePrivateContextKeys,
  savePrivateContext,
  scrubStoredPhoneNumbers,
} from '../../services/userPrivateContext.service';
import { deleteUserNotes } from '../../services/userNotes.service';
import { deleteUserProfileFields, setUserProfileField } from '../../services/userProfile.service';
import { republishFacts } from '../../services/factRepublish.service';
import { listImportAttempts } from '../../services/contacts.service';
import { importProfiles, parseProfile, ParsedProfile } from '../../services/profileImport.service';
import { listWakeUpCandidates, previewWakeUpMessage } from '../../services/wakeUp.service';
import { composeWeeklySummary, sendWeeklySummary } from '../../services/weeklySummary.service';
import { streamBaseExport } from '../../services/baseExport.service';
import {
  createCohort,
  deactivateCohort,
  findCohortAnyState,
  listCohortMembers,
  listCohorts,
  launchWindowStatus,
} from '../../services/inviteCohorts.service';
import { readLabels } from '../../services/labelReader.service';
import { planResearch, TriggerLedger } from '../../services/researchTriggers.service';
import {
  getLabelQueue,
  getLabelQueueTotal,
  getRawLabelEvidence,
  parsePhonebookLabelsForUser,
  reprocessLabelQueue,
  reprocessSavedOccupationFacts,
} from '../../services/labelParser.service';
import { getReferralFunnel } from '../../services/referralLink.service';
import { referralTree, MAX_DEPTH } from '../../services/referralTree.service';
import {
  canonicalPhone,
  goalsThisMemberMightUnblock,
} from '../../services/newMemberForGoal.service';
import { addSeatContact, repairSeat } from '../../services/seatContacts.service';
import { tellOwnersANewMemberFitsAGoal } from '../../services/newMemberForGoal.service';
import {
  expireUnansweredRequests,
  introductionsThatWouldExpire,
  tellAskersTheirRequestExpired,
} from '../../services/introductionExpiry.service';
import { readGoalFeedback } from '../../services/goalFeedback.service';
import { pilotOutcomes } from '../../services/pilotOutcomes.service';
import { addRosterMember, removeRosterMember } from '../../services/roster.service';
import { backfillHumanRelationshipTiers } from '../../services/tools/relationshipScores';
import {
  demandExcludedUserIds,
  findUnmetNeeds,
  isCandidateCountry,
} from '../../services/unmetNeeds.service';
import {
  previewForeignSyncLinks,
  removeForeignSyncLinks,
} from '../../services/foreignSync.service';
import {
  buildTargetList,
  buildTargetListWithGates,
  clearTargetListCache,
  readScoreHistory,
  TargetScoreEntry,
  TargetListStatus,
  startTargetListBuild,
  targetListStatus,
} from '../../services/targetScoring.service';
import { baseWalkStatus } from '../../services/basePool.service';
import { researchStatus, researchTrail } from '../../services/researchRunner.service';
import { connectedDevices, deviceKey } from '../../services/sse.service';
import {
  isHandoffAuthor,
  markHandoffRead,
  postHandoff,
  readHandoff,
} from '../../services/handoff.service';
import {
  applyTargetDecisions,
  clearTargetDecision,
  listTargetDecisions,
  TargetDecisionInput,
} from '../../services/targetDecisions.service';
import {
  generateAndStoreWeeklyReport,
  getStoredLabReports,
  currentWeekStartISO,
  StoredLabReport,
} from '../../services/labReport.service';
import {
  openDueCampaigns,
  sendDueCampaignAsks,
  sweepStaleParticipants,
  syncChorusAskTechniqueTags,
  closeStaleCampaigns,
  seedTestCampaign,
  currentGlobalDial,
  sharedCirclesForCampaigns,
  withSharedCircles,
} from '../../services/chorusCampaign.service';

const adminRouter = Router();

adminRouter.use(authenticateJwt, requireAdminRole);

// App flags an admin may flip from the console. Whitelist on purpose — a typo
// must not mint a brand-new (fail-open-read) flag row.
const MANAGED_APP_FLAGS = [
  'invite_only',
  'invite_link_ready',
  // The founder, 24 September (D485): the free days an invitation carries are
  // „switchable … from dashboard". This is that switch; the number beside it
  // lives in `app_settings` and is set through /admin/settings below.
  INVITE_FREE_DAYS_FLAG,
  /**
   * THE TWO DOORS, 24 September. Both DEFAULT OFF, and adding them here does
   * not change that: an allow-list entry does not create a row, and a missing
   * row still reads false. It only makes the switch reachable, which it has to
   * be before anyone can turn it BACK OFF in a hurry — that is the reason they
   * are added at all, not the reason they are turned on.
   *
   * They are listed in the order they are meant to be flipped, and the order is
   * not a preference:
   *
   *   PERSONAL_CODE_ONLY_FLAG   closes three registration doors. Wrong, and
   *                             ~465 people who could join today cannot.
   *   LOGIN_INVITE_ONLY_FLAG    refuses EXISTING people at the door. Wrong, and
   *                             some of the 35 legacy accounts that use Netai
   *                             every day — Lika Ose with 321 threads among
   *                             them — cannot get back in.
   *
   * Register: §34 for the login gate, and `onlyAPersonsOwnCode.test.ts` for
   * what the first one closes and the one door it deliberately leaves open.
   */
  PERSONAL_CODE_ONLY_FLAG,
  LOGIN_INVITE_ONLY_FLAG,
] as const;

/**
 * NUMBERS THE DASHBOARD MAY SET, as an allow-list for the same reason the
 * flags have one: `app_settings` is a table, and a route that writes any key a
 * caller names is a route that writes keys nobody designed.
 */
const MANAGED_SETTINGS = [INVITE_FREE_DAYS_SETTING] as const;

interface AppSettingRow {
  setting: string;
  value: number;
  updated_at: string;
  updated_by: string | null;
}

adminRouter.get('/settings', async (_req: Request, res: Response<ApiResponse<AppSettingRow[]>>) => {
  try {
    const result = await query<AppSettingRow>(
      `SELECT setting, value::float8 AS value, updated_at, updated_by
         FROM app_settings WHERE setting = ANY($1) ORDER BY setting`,
      [[...MANAGED_SETTINGS]],
    );
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin settings]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

/**
 * ⚠️ THIS ROUTE GIVES PRODUCT AWAY. Every point of `value` is free time for
 * everybody who joins from now on — and since nobody now joins without an
 * invitation, that is everybody. Registered as §35.
 *
 * The bound is a TYPO GUARD, not a policy: the founder described twenty
 * falling to ten or five, and a dashboard should not be able to hand out a
 * year because somebody's finger slipped on the keyboard. It refuses rather
 * than clamping — silently storing 90 when 900 was typed would be the same
 * class of fault as everything else found today, a number that is not the
 * number somebody meant.
 */
adminRouter.put(
  '/settings/:setting',
  param('setting')
    .isIn([...MANAGED_SETTINGS])
    .withMessage('unknown setting'),
  body('value')
    .isInt({ min: 0, max: MAX_INVITE_FREE_DAYS })
    .withMessage(`value must be a whole number between 0 and ${MAX_INVITE_FREE_DAYS}`),
  async (req: Request, res: Response<ApiResponse<{ setting: string; value: number }>>) => {
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
      const setting = String(req.params.setting);
      const value = Number((req.body as { value: number }).value);
      const admin = (req as AuthenticatedRequest).user.userId;
      const saved = await writeSetting(setting, value, `admin:${admin}`);
      // Named in the log because „who set it to that" must have an answer.
      // eslint-disable-next-line no-console
      console.log(`[admin-settings] admin ${admin} set ${setting} = ${saved}`);
      res.status(200).json({ success: true, data: { setting, value: saved } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[admin settings write]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

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
  /**
   * The per-BLOCK cap, served by the server so the editor cannot show a
   * different number from the one that validates the save (ticket 9 task 26).
   * That mismatch is the whole bug: the page counted "of 30,000" while the
   * validator still refused at 20,000, and a 20,286-char PUT bounced with an
   * undocumented cap. The mode ceiling is the OTHER limit and travels per mode
   * in `mode_totals.budget_chars` — a block can be inside this cap and still be
   * refused because its mode is full.
   */
  max_block_content_chars: number;
}

adminRouter.get(
  '/prompt-blocks',
  async (_req: Request, res: Response<ApiResponse<PromptBlocksListing>>) => {
    try {
      const blocks = await listPromptBlocks();
      res.status(200).json({
        success: true,
        data: {
          blocks,
          modes: RUN_MODES,
          mode_totals: computeModeTotals(blocks),
          max_block_content_chars: MAX_BLOCK_CONTENT_CHARS,
        },
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
  body('content')
    .optional()
    .isString()
    .isLength({ max: MAX_BLOCK_CONTENT_CHARS })
    // Row 215: the refusal names the way round it. One string, so the route
    // and the service cannot drift into saying two different things.
    .withMessage(BLOCK_TOO_LONG_MESSAGE),
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

// Ticket 10 Task 7 (continues Ticket 9 Task 18): everything ONE account wrote
// inside a time window, previewed before it goes. The 2 September test writes
// could not all be found by hand; created_at finds them.
//   POST /admin/facts/retract-range
//   body: { user_id, created_after, created_before, dry_run }   dry_run defaults to TRUE
//   Undo (per row, from the preview's ids):
//     UPDATE contact_facts SET retracted_at = NULL, is_public = <prior> WHERE id = <id>;
adminRouter.post(
  '/facts/retract-range',
  body('user_id').isInt({ min: 1 }),
  body('created_after').isISO8601(),
  body('created_before').isISO8601(),
  body('dry_run').optional().isBoolean(),
  async (req: Request, res: Response) => {
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
      const input = req.body as {
        user_id: number;
        created_after: string;
        created_before: string;
        dry_run?: boolean | string;
      };
      // Anything but an explicit false is a dry run — the safe reading of a
      // missing or mistyped flag on a route that retracts.
      const dryRun = !(input.dry_run === false || input.dry_run === 'false');
      const result = await retractFactsByRange(
        String(input.user_id),
        new Date(input.created_after),
        new Date(input.created_before),
        dryRun,
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('window') || message.includes('created_before')) {
        res.status(400).json({ success: false, error: message });
        return;
      }
      // eslint-disable-next-line no-console
      console.error('[admin retract-range]', error);
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

// One republish call moderates this many facts: a few model waves, always
// answering well inside the proxy's window. The caller loops for the rest.
const DEFAULT_REPUBLISH_LIMIT = 40;
const MAX_REPUBLISH_LIMIT = 200;

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

// The whole registered base as one file (Ticket 10 Task 8; Ticket 9 Task 1).
//   GET /admin/base-export.csv                 every account, streamed in batches
//   GET /admin/base-export.csv?max=200         a sample
// One command re-exports it:
//   curl -H "Authorization: Bearer <admin token>" https://api.netai.guru/admin/base-export.csv > base.csv
// No full phone number is in the file — the last four digits of one phone are
// the key for the founder's own review.
adminRouter.get('/base-export.csv', async (req: Request, res: Response) => {
  const rawMax = Number(req.query.max);
  const rawBatch = Number(req.query.batch);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="netai_base.csv"');
  res.status(200);
  try {
    const written = await streamBaseExport((chunk) => res.write(chunk), {
      ...(Number.isFinite(rawMax) && rawMax > 0 && { maxAccounts: Math.floor(rawMax) }),
      ...(Number.isFinite(rawBatch) && rawBatch > 0 && { batch: Math.floor(rawBatch) }),
    });
    // eslint-disable-next-line no-console
    console.log(`[admin base-export] wrote ${written} rows`);
  } catch (error) {
    // The headers are gone; the honest thing left is to say so inside the file.
    // eslint-disable-next-line no-console
    console.error('[admin base-export]', error);
    res.write(`\n"EXPORT FAILED: ${String((error as Error).message).replace(/"/g, '""')}"\n`);
  } finally {
    res.end();
  }
});

// The weekly summary (Ticket 10 Task 24 (c); the standard's line 5). The cron
// sends it Monday 06:00 UTC; these are the tester's fast-forward.
//   GET  /admin/weekly-summary/preview?user_id=501   composes, writes nothing
//   POST /admin/weekly-summary/run?user_id=501       writes it into the user's goal
//                                                    threads and pending list NOW
adminRouter.get('/weekly-summary/preview', async (req: Request, res: Response) => {
  const userId = String(req.query.user_id ?? '').trim();
  if (!/^\d+$/.test(userId)) {
    res.status(400).json({ success: false, error: 'user_id აუცილებელია' });
    return;
  }
  try {
    res.status(200).json({ success: true, data: await composeWeeklySummary(userId) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin weekly-summary preview]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.post('/weekly-summary/run', async (req: Request, res: Response) => {
  const userId = String(req.query.user_id ?? '').trim();
  if (!/^\d+$/.test(userId)) {
    res.status(400).json({ success: false, error: 'user_id აუცილებელია' });
    return;
  }
  try {
    res.status(200).json({ success: true, data: await sendWeeklySummary(userId) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin weekly-summary run]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

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
      // Ticket 19 G7: what the run SAID and what it DID, in one read. The step
      // captions on 15346 contradicted each other three times in eight minutes
      // and there was no way to tell which was true; tool_calls is the record
      // the captions were being mistaken for. Grouped by run_id on the reader's
      // side — each row carries the run it belongs to.
      const [messages, toolCalls] = await Promise.all([
        getThreadMessages(threadId, { includeSteps: true }),
        getToolCallsForThread(threadId),
      ]);
      res.status(200).json({
        success: true,
        data: { thread: threadResult.rows[0], messages, tool_calls: toolCalls },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[admin thread read]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

/**
 * The page, its real total, and whether it was cut — built in one place so the
 * three cannot drift, and exported so the claim can be tested.
 *
 * `truncated` is the sentence this route makes to a reader who is counting, and
 * it was a sentence nobody held. Every row carries the window count, so the
 * total and the rows come from one snapshot; taking the count off each row here
 * is what stops `total_count` being published as though `task_asks` had such a
 * column.
 */
export function askPageFrom<T extends { total_count: number }>(
  rows: readonly T[],
): { asks: Omit<T, 'total_count'>[]; total: number; truncated: boolean } {
  const asks = rows.map(({ total_count: _total, ...ask }) => ask);
  // No rows means no row to carry the count, and zero is then the truth rather
  // than a missing value — an empty page under these filters.
  const total = rows[0]?.total_count ?? 0;
  return { asks, total, truncated: asks.length < total };
}

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
    // Ticket 9 Task 22, answered where it was asked: these are member-to-member
    // asks, and the technique tag (WHEN · HOW · REASON, D50) is a property of
    // CAMPAIGN invites — it lives on /admin/chorus/asks, not on this table.
    // What this table does carry since Ticket 10: who pays for the chain
    // (origin_user_id, D123) and whether a standing rule answered (Task 22).
    /**
     * 22 September — THE COUNT TRAVELS WITH THE PAGE, because without it this
     * route silently published a number that meant nothing.
     *
     * The seat read „100 asks before the block and 100 after" as evidence that
     * the introduction route creates no ask row, and wrote it down. It reads
     * 100 whatever happens: a bare array capped at 100, no total, no flag.
     * They caught it themselves, on the fourth reading, by asking this table
     * the question I keep having to ask everything else — WHAT POPULATION DOES
     * THIS NUMBER COUNT.
     *
     * Ticket 16 Task 64 solved exactly this for `/admin/goals` („three screens
     * read three numbers for one thing... two of them were page sizes printed
     * as totals"), and this route was left as it was. Same shape now: the rows,
     * the real total, and whether the page was cut.
     *
     * ONE QUERY, NOT TWO IN PARALLEL, and the first version of this was two.
     *
     * „The count runs beside the page under the same filters, so the two cannot
     * describe different populations" was the sentence, and two statements on a
     * live table are two snapshots however they are launched. An ask written
     * between them makes `total` 100 and the page 100 rows, and the route then
     * publishes `truncated: false` over a table that holds 101 — the same false
     * reassurance this change was made to remove, moved one step along.
     *
     * `COUNT(*) OVER ()` is evaluated before the LIMIT, so it is the real total
     * under the same filters AND from the same snapshot as the rows it travels
     * with. It costs a full scan of the filtered set where the paged read alone
     * could have stopped at the limit; against 176 rows that is nothing, and a
     * number that cannot be wrong is worth more than the scan when it is not.
     */
    const result = await query<{ total_count: number }>(
      // Cast, so the total arrives as a number: an uncast COUNT is bigint and
      // node-postgres hands bigint back as a STRING. The comparison below
      // would have survived it on coercion; the JSON would not — the route
      // would publish `"total": "176"` beside a numeric `truncated`, and the
      // reader would have to know which of the two to trust.
      `SELECT (COUNT(*) OVER ())::int AS total_count,
              ta.id, ta.task_id, ta.parent_ask_id,
              ta.from_user_id, fu.name AS from_name,
              ta.to_user_id, tu.name AS to_name,
              ta.origin_user_id, ta.automatic, ta.answer_rule_id, ta.is_follow_up,
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
    res.status(200).json({
      success: true,
      // A SHAPE CHANGE, and deliberately the same one `/admin/goals` already
      // has rather than a third invention: `data` was the bare array.
      data: askPageFrom(result.rows),
      note: 'Member-to-member asks. The technique tag (when · how · reason) belongs to campaign invites: GET /admin/chorus/asks.',
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin asks log]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Ticket 8 Task 2(c), Q-29: the admin read path for GOALS — per goal: the
// brief, the next wake, how many wakes actually entered the thread, how many
// asks went out, and the question the goal is blocked on right now. Open
// goals first, then the rest by recency.
adminRouter.get('/goals', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.query.user_id);
    if (!Number.isFinite(userId) || userId <= 0) {
      res.status(400).json({ success: false, error: 'user_id აუცილებელია' });
      return;
    }
    const list = await adminListGoals(String(userId));
    // Ticket 16 Task 64: the page and its true total travel together.
    res.status(200).json({ success: true, data: list });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin goals]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Ticket 10 Task 28 (a): one goal in full — stage, the actions with their
// times, the blocker, the payer and the outcome. The daily row of the 14-day
// test is filled from this and the list above.
// Ticket 11 Task 6 (D95, D131): a single private-context key, a single note or
// a single profile line of one account can be deleted from the admin seat and
// read back gone. Undo: re-save the value through the same tables' writers.
//   DELETE /admin/users/:id/private-context/:key
//   DELETE /admin/users/:id/notes/:noteId
//   DELETE /admin/users/:id/profile/:key
adminRouter.delete('/users/:id/private-context/:key', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.id);
    const key = String(req.params.key ?? '').trim();
    if (!Number.isFinite(userId) || userId <= 0 || key === '') {
      res.status(400).json({ success: false, error: 'id და key აუცილებელია' });
      return;
    }
    const { deleted } = await deletePrivateContextKeys(String(userId), [key]);
    if (deleted === 0) {
      res.status(404).json({ success: false, error: 'ასეთი key არ არის' });
      return;
    }
    res.status(200).json({ success: true, data: { user_id: userId, key, deleted } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin private-context delete]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// One memory line, capped the way the assistant's own writer caps them.
const MAX_PRIVATE_CONTEXT_CHARS = 8000;

// Ticket 16 Task 37: the delete above had no way back, so proving it cost a
// real memory line. This puts one back — the same value, the same key — which
// makes the delete reversible and the row testable without losing anything.
//   PUT /admin/users/:id/private-context/:key { value }
adminRouter.put(
  '/users/:id/private-context/:key',
  param('id').isInt({ min: 1 }),
  body('value').isString().isLength({ min: 1, max: MAX_PRIVATE_CONTEXT_CHARS }),
  async (
    req: Request,
    res: Response<ApiResponse<{ user_id: number; key: string; restored: boolean }>>,
  ) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'value აუცილებელია' });
      return;
    }
    try {
      const userId = Number(req.params.id);
      const key = String(req.params.key ?? '').trim();
      if (key === '') {
        res.status(400).json({ success: false, error: 'key აუცილებელია' });
        return;
      }
      const adminId = (req as AuthenticatedRequest).user.userId;
      // The same writer the assistant uses, so a restored line is scrubbed of
      // phone numbers exactly like an original one (D95).
      await savePrivateContext(
        String(userId),
        key,
        String((req.body as { value: string }).value),
        'set',
      );
      void recordProductEvent(adminId, 'admin_private_context_restore', {
        target_user_id: userId,
        key,
      });
      // eslint-disable-next-line no-console
      console.log(`[admin-memory] admin ${adminId} restored key "${key}" on user ${userId}`);
      res.status(200).json({ success: true, data: { user_id: userId, key, restored: true } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[admin private-context restore]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

adminRouter.delete('/users/:id/notes/:noteId', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.id);
    const noteId = Number(req.params.noteId);
    if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(noteId) || noteId <= 0) {
      res.status(400).json({ success: false, error: 'id და noteId აუცილებელია' });
      return;
    }
    const { deleted } = await deleteUserNotes(String(userId), [noteId]);
    if (deleted === 0) {
      res.status(404).json({ success: false, error: 'ასეთი ჩანაწერი არ არის' });
      return;
    }
    res.status(200).json({ success: true, data: { user_id: userId, note_id: noteId, deleted } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin note delete]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.delete('/users/:id/profile/:key', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.id);
    const key = String(req.params.key ?? '').trim();
    if (!Number.isFinite(userId) || userId <= 0 || key === '') {
      res.status(400).json({ success: false, error: 'id და key აუცილებელია' });
      return;
    }
    const { deleted } = await deleteUserProfileFields(String(userId), [key]);
    if (deleted === 0) {
      res.status(404).json({ success: false, error: 'ასეთი ველი არ არის' });
      return;
    }
    res.status(200).json({ success: true, data: { user_id: userId, key, deleted } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin profile delete]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// D150 (9 Sep): one fact retracted by id on the founder's word (record 3504).
// Undo: `retracted_at = NULL` on the id; the response quotes what went.
//   POST /admin/facts/:id/retract
adminRouter.post('/facts/:id/retract', async (req: Request, res: Response) => {
  try {
    const factId = Number(req.params.id);
    if (!Number.isFinite(factId) || factId <= 0) {
      res.status(400).json({ success: false, error: 'id აუცილებელია' });
      return;
    }
    const gone = await retractFactById(factId);
    if (gone === null) {
      res.status(404).json({ success: false, error: 'ასეთი ცოცხალი ფაქტი არ არის' });
      return;
    }
    res.status(200).json({ success: true, data: gone });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin fact retract]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Answers-12 item 1 (the founder, 10 Sep): give account 501 admin rights so
// he logs into the dashboard as himself. Logged as a product event; undo is
// the same call with enabled: false.
//   POST /admin/users/:id/admin-access { enabled: true|false }
adminRouter.post(
  '/users/:id/admin-access',
  param('id').isInt({ min: 1 }),
  body('enabled').isBoolean(),
  async (req: Request, res: Response<ApiResponse<AdminAccessRow>>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'არასწორი პარამეტრები' });
      return;
    }
    try {
      const targetId = Number(req.params.id);
      const adminId = (req as AuthenticatedRequest).user.userId;
      const enabled = (req.body as { enabled: boolean }).enabled === true;
      const updated = await setAdminAccess(targetId, enabled);
      if (!updated) {
        res.status(404).json({ success: false, error: 'მომხმარებელი ვერ მოიძებნა' });
        return;
      }
      void recordProductEvent(adminId, 'admin_access_change', {
        target_user_id: targetId,
        enabled,
      });
      // eslint-disable-next-line no-console
      console.log(
        `[admin-access] admin ${adminId} set admin access ${enabled} on user ${targetId}`,
      );
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[admin access]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// Ticket 16 Task 16 (D177): a login of his own for the founder's account.
//   POST /admin/users/:id/admin-password { password }   (≥ 10 characters)
// The password is never logged and never echoed; the event records only who
// set it for whom.
adminRouter.post(
  '/users/:id/admin-password',
  param('id').isInt({ min: 1 }),
  body('password').isString().isLength({ min: MIN_ADMIN_PASSWORD_CHARS }),
  async (req: Request, res: Response<ApiResponse<{ user_id: number; password_set: boolean }>>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'პაროლი მინიმუმ 10 სიმბოლო' });
      return;
    }
    try {
      const targetId = Number(req.params.id);
      const adminId = (req as AuthenticatedRequest).user.userId;
      const ok = await setAdminPassword(
        targetId,
        String((req.body as { password: string }).password),
      );
      if (!ok) {
        res.status(404).json({ success: false, error: 'მომხმარებელი ვერ მოიძებნა' });
        return;
      }
      void recordProductEvent(adminId, 'admin_password_set', { target_user_id: targetId });
      // eslint-disable-next-line no-console
      console.log(`[admin-access] admin ${adminId} set a password on user ${targetId}`);
      res.status(200).json({ success: true, data: { user_id: targetId, password_set: true } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[admin password]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// Ticket 12 Task 12 (D137): the six launch invitations need a referral code
// each; two of the six accounts never opened the invite screen, so none was
// ever minted. Same function the app uses; idempotent.
//   POST /admin/users/:id/referral-code
/**
 * ROW 264, the founder: „the admin does not show who invited whom. Done when:
 * the admin shows the invitation/referral tree."
 *
 * ⚠️ AND IT SAYS WHICH POPULATION EVERY NODE IS, which is the difference
 * between useful and misleading. Read from the live base while building this:
 *
 *   805  accounts carry an inviter
 *     8  of them have ever opened Netai
 *     6  of them are fictional test seats
 *
 * „805 people were invited" is true and would have told him something false —
 * almost all of them are legacy Ally rows imported before Netai existed. The
 * number he actually needs is the eight.
 *
 * `?root=<id>` for one person's tree, `?depth=N` up to six (the invitation
 * reward goes six levels, so a shallower tree cannot be checked against it).
 * Names only; no phone number appears anywhere in this.
 */
/**
 * ROW 272 — „answers saved with that goal and readable in the admin."
 *
 * Named by PERSON and by the goal's own title, because a page of answers keyed
 * by two integers is a page nobody reads twice. Verbatim, in the order they
 * were given.
 */
/**
 * ROW 274 — the pilot outcomes the founder reads on one page, for any range.
 *
 * Beside `/admin/pilot/report` rather than inside it: that one is ACTIVITY per
 * day, this is OUTCOMES per person, and one object whose fields mean different
 * things depending on which half you are reading is the trap that report was
 * written against.
 *
 * It carries what it CANNOT measure in `not_measurable`, so a screen cannot
 * show the numbers without the gap.
 */
adminRouter.get('/pilot/outcomes', async (req: Request, res: Response) => {
  const days = Number(String(req.query.days ?? '28'));
  if (!Number.isFinite(days) || days < 1 || days > 365) {
    res.status(400).json({ success: false, error: 'days must be 1-365.' });
    return;
  }
  try {
    res.status(200).json({ success: true, data: await pilotOutcomes(days) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin pilot outcomes]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.get('/goal-feedback', async (req: Request, res: Response) => {
  const limit = Number(String(req.query.limit ?? '200'));
  try {
    const rows = await readGoalFeedback(Number.isFinite(limit) ? limit : 200);
    res.status(200).json({ success: true, data: { answers: rows, count: rows.length } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin goal feedback]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

/**
 * Row 262, the DRY RUN the tester asked for — what a given phone WOULD match,
 * queueing nothing and telling nobody.
 *
 * ⚠️ IT EXISTS BECAUSE THE FEATURE CANNOT OTHERWISE BE TESTED WITHOUT SPENDING
 * A REAL REGISTRATION. Their words: the seat route makes a NEW seat holding an
 * OLD one and never the reverse, so no seat has a not-yet-registered number in
 * its phonebook, and the one trigger this feature has is somebody registering.
 * A feature whose only proof is an irreversible event is a feature nobody
 * checks twice.
 *
 * Read-only by construction: it calls the matcher and not the queue, so there
 * is no path from here to a card on anybody's screen. The match is reported
 * exactly as the queue would see it, including the empty case — „nothing
 * matched" is an answer and must be distinguishable from „I could not look".
 */
adminRouter.get('/new-member-match', async (req: Request, res: Response) => {
  const phone = String(req.query.phone ?? '').trim();
  if (phone === '') {
    res.status(400).json({ success: false, error: 'phone is required' });
    return;
  }
  try {
    const matches = await goalsThisMemberMightUnblock(phone);
    /**
     * ⚠️ I TOLD THE TESTER THIS ROUTE WOULD SAY WHEN IT COULD NOT READ A
     * NUMBER, AND IT DID NOT. They typed „500000001", got „Looked, and nothing
     * matched", and pointed out — correctly — that this is a confident nothing
     * about a number we never understood.
     *
     * AND I CANNOT TELL THE TWO APART BY LENGTH ALONE. E.164 allows from about
     * seven digits to fifteen, so a nine-digit string is a legal international
     * number somewhere and a local Georgian one here. Claiming to know which
     * would be the same overreach again, one layer down.
     *
     * So the route says WHAT IT LOOKED FOR. „+500000001" next to the answer is
     * immediately recognisable as a misread to the person who typed it, which
     * no adjective of mine could be. The warning is added only where the guess
     * is weakest: no leading plus, and too few digits to carry a country code
     * and a subscriber number (a full Georgian number is twelve).
     */
    const lookedFor = canonicalPhone(phone);
    const digits = phone.replace(/\D+/g, '');
    const mayLackCountryCode = !phone.trim().startsWith('+') && digits.length < 11;
    res.status(200).json({
      success: true,
      data: {
        would_queue: matches.length,
        matches,
        looked_for: lookedFor,
        ...(mayLackCountryCode && {
          warning:
            `Read as "${lookedFor}". That is ${digits.length} digits with no leading +, which ` +
            'is probably a local number missing its country code — in which case this matched ' +
            'nothing because it never found the number, not because the number has no matches.',
        }),
        note:
          matches.length === 0
            ? 'Looked, and nothing matched. Not the same as a failure to look.'
            : 'These cards WOULD be queued on registration. Nothing was queued by this call.',
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin new-member match]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

/**
 * §59 — EXPIRE THE INTRODUCTIONS NOBODY ANSWERED (row 275, D496).
 *
 * ⚠️ THE DRY RUN IS THE DEFAULT, and that is the whole shape of this route.
 * It changes rows belonging to real people and it sends each of them a card,
 * so „show me what you would do" must be the thing that happens when somebody
 * forgets a parameter. `confirm: true` is the only way to write.
 *
 * The two calls are deliberately one route: what gets expired and who gets
 * told come from ONE statement, so a second query cannot read a different set.
 * The ids are returned because they are the undo.
 */
adminRouter.post(
  '/introductions/expire',
  body('confirm').optional().isBoolean(),
  async (req: Request, res: Response) => {
    const confirm = (req.body as { confirm?: boolean }).confirm === true;
    const adminId = (req as AuthenticatedRequest).user.userId;
    try {
      if (!confirm) {
        const waiting = await introductionsThatWouldExpire();
        res.status(200).json({
          success: true,
          data: {
            dry_run: true,
            would_expire: waiting.length,
            requests: waiting,
            note:
              waiting.length === 0
                ? 'Looked, and none are past the deadline. Nothing to do.'
                : 'Nothing was changed. Send {"confirm":true} to expire these and tell each asker.',
          },
        });
        return;
      }

      const expired = await expireUnansweredRequests();
      const told = await tellAskersTheirRequestExpired(expired);
      // eslint-disable-next-line no-console
      console.log(
        `[intro-expiry] admin ${adminId} expired ${expired.length} request(s), told ${told} asker(s): ` +
          expired.map((e) => e.id).join(', '),
      );
      res.status(200).json({
        success: true,
        data: {
          dry_run: false,
          expired: expired.length,
          askers_told: told,
          // The undo needs these and nothing else.
          ids: expired.map((e) => e.id),
          undo: "UPDATE introduction_requests SET status = 'pending', responded_at = NULL WHERE id = ANY(<ids>)",
        },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[intro-expiry]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

/**
 * §60 — a made-up, tagged contact in a test seat's phonebook (rows 269, 262b).
 *
 * Every refusal is in the service, above every write, because this file's own
 * history is refusals that fired after the INSERT and left seats behind.
 */
adminRouter.post(
  '/test-accounts/:id/contacts',
  param('id').isInt({ min: 1 }),
  body('phone').isString(),
  body('name').isString(),
  body('tag').isString(),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'phone, name და tag საჭიროა' });
      return;
    }
    const seatId = Number(req.params.id);
    const { phone, name, tag } = req.body as { phone: string; name: string; tag: string };
    try {
      const result = await addSeatContact(seatId, phone, name, tag);
      if (!result.ok) {
        // The refusal is NAMED, so a caller learns which rule stopped them
        // rather than being told the request was simply bad.
        res.status(400).json({
          success: false,
          error: result.refusal,
          ...(result.detail !== undefined && { detail: result.detail }),
        });
        return;
      }
      // eslint-disable-next-line no-console
      console.log(
        `[seat-contact] admin ${(req as AuthenticatedRequest).user.userId} added ` +
          `"${result.contact.name}" (${result.contact.tag}) to seat ${seatId}`,
      );
      res.status(201).json({ success: true, data: result.contact });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[seat-contact]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

/**
 * §61 — UNDOING WHAT THIS MORNING PUT IN A TEST SEAT WRONGLY.
 *
 * Two kinds of wreckage, both mine: `"UserTags"` rows written through the
 * wrong id column, and `new_member_for_goal` cards queued by a matcher that
 * was reading that column and treating an INDUSTRY as an organisation.
 *
 * ⚠️ A DRY RUN BY DEFAULT, and the plan names the exact ids. `confirm: true`
 * is the only thing that deletes, and it deletes the ids the same call just
 * read — the predicate is how they were found, the ids are what is agreed to.
 *
 * What makes it safe is not the caller's care: the target must be a test
 * seat, only `"contactId" IS NULL` tag rows are in reach (a correct row is
 * never matched, so running it twice cannot empty a phonebook), and only
 * `held` cards are — `held` means never shown to anybody, so a card somebody
 * has seen or answered cannot be taken from them. It queues nothing: whatever
 * should exist afterwards is made by the matcher, not by this.
 */
adminRouter.post(
  '/test-accounts/:id/repair',
  param('id').isInt({ min: 1 }),
  async (req: Request, res: Response) => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({ success: false, error: 'seat id საჭიროა' });
      return;
    }
    const seatId = Number(req.params.id);
    const confirm = (req.body as { confirm?: unknown })?.confirm === true;
    try {
      const result = await repairSeat(seatId, confirm);
      if (!result.ok) {
        res.status(400).json({ success: false, error: result.refusal });
        return;
      }
      if (result.repair.deleted) {
        // eslint-disable-next-line no-console
        console.log(
          `[seat-repair] admin ${(req as AuthenticatedRequest).user.userId} removed ` +
            `${result.repair.tag_rows.length} misplaced tag row(s) and ` +
            `${result.repair.held_cards.length} held card(s) from seat ${seatId}`,
        );
      }
      res.status(200).json({
        success: true,
        data: {
          ...result.repair,
          note: result.repair.deleted
            ? 'Deleted the ids listed. Nothing was queued in their place.'
            : 'Nothing was deleted. Send { "confirm": true } to remove exactly these ids.',
        },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[seat-repair]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

/**
 * §59's READ-ONLY HALF — the tester asked for it and the reason is good.
 *
 * ⚠️ THEIR SAFETY CHECK REFUSES ANY WRITE ROUTE, INCLUDING A DRY RUN. So the
 * only way for them to confirm sixteen expiries was to ask me for the numbers
 * — which makes their check a report of MY report, and „I looked" and „he told
 * me he looked" are not the same fact. That is the distinction this whole box
 * runs on, and it was pointing at me.
 *
 * A GET, so their rule and their verification stop being in conflict.
 */
adminRouter.get('/introductions/expiry-status', async (_req: Request, res: Response) => {
  try {
    const [counts, expired] = await Promise.all([
      query<{ status: string; n: string }>(
        `SELECT status, COUNT(*)::text AS n FROM introduction_requests GROUP BY status`,
      ),
      query<{ id: number; responded_at: string; target_name: string | null }>(
        `SELECT id, responded_at, target_name
           FROM introduction_requests
          WHERE status = 'expired'
          ORDER BY id
          LIMIT 200`,
      ),
    ]);
    const byStatus: Record<string, number> = {};
    for (const row of counts.rows) byStatus[row.status] = Number(row.n);
    res.status(200).json({
      success: true,
      data: {
        by_status: byStatus,
        expired_ids: expired.rows.map((r) => r.id),
        expired: expired.rows,
        cards_queued: (
          await query<{ n: string }>(
            `SELECT COUNT(*)::text AS n FROM pending_updates WHERE kind = 'intro_expired'`,
          )
        ).rows[0]?.n,
        note: 'Read only. Nothing here changes anything; the sweep is POST /admin/introductions/expire.',
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[intro-expiry status]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

/**
 * ROW 262(b) — REPLAY THE NEW-MEMBER CHECK FOR A NUMBER, as registration runs
 * it. It queues the real cards; it registers nobody.
 *
 * ⚠️ IT EXISTS BECAUSE THE OBVIOUS WAY WOULD HAVE PROVED NOTHING. The tester
 * offered: „you register the two numbers through the test-accounts route." I
 * went to do it and read that route first — `testSeatCreate` does
 * `INSERT INTO "User"` directly and NEVER CALLS `registerUser`, which is where
 * row 262's hook lives. Creating a seat on those numbers would have produced
 * no card, and reporting that as a pass or a fail would have been a statement
 * about a path nobody had walked.
 *
 * ⚠️ AND SAY WHAT THIS DOES NOT PROVE. It runs the hook, so it proves the
 * match, the card, the wording and the once-only guard. It does NOT prove that
 * `registerUser` calls the hook — that one line is asserted by a test and by
 * nothing else until a real person registers.
 */
adminRouter.post(
  '/new-member-match/replay',
  body('phone').isString(),
  async (req: Request, res: Response) => {
    const phone = String((req.body as { phone?: string }).phone ?? '').trim();
    if (phone === '') {
      res.status(400).json({ success: false, error: 'phone is required' });
      return;
    }
    try {
      const queued = await tellOwnersANewMemberFitsAGoal(phone);
      // eslint-disable-next-line no-console
      console.log(
        `[new-member replay] admin ${(req as AuthenticatedRequest).user.userId}: ` +
          `${queued} card(s) queued`,
      );
      res.status(200).json({
        success: true,
        data: {
          cards_queued: queued,
          note:
            queued === 0
              ? 'Nothing matched, or every match had already been raised once. Both are correct outcomes.'
              : 'Real cards, queued exactly as a registration would. Nobody was registered and nothing was sent to this number.',
          does_not_prove:
            'That registerUser calls this hook. Only a real registration shows that; here it is ' +
            'asserted by a test.',
        },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[new-member replay]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

adminRouter.get('/referrals/tree', async (req: Request, res: Response) => {
  const rootRaw = String(req.query.root ?? '').trim();
  const root = rootRaw === '' ? undefined : Number(rootRaw);
  if (root !== undefined && !Number.isInteger(root)) {
    res.status(400).json({ success: false, error: 'root must be a user id.' });
    return;
  }
  const depthRaw = Number(String(req.query.depth ?? '3'));
  if (!Number.isFinite(depthRaw) || depthRaw < 1 || depthRaw > MAX_DEPTH) {
    res.status(400).json({ success: false, error: `depth must be 1-${MAX_DEPTH}.` });
    return;
  }
  try {
    const tree = await referralTree(root, depthRaw);
    res.status(200).json({ success: true, data: tree });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin referral tree]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.post('/users/:id/referral-code', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      res.status(400).json({ success: false, error: 'id აუცილებელია' });
      return;
    }
    const code = await getOrCreateReferralCode(String(userId));
    res.status(200).json({ success: true, data: { user_id: userId, referral_code: code } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin referral code]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Ticket 12 Task 16 (D147, the founder 9 Sep): during the pilot EVERY
// conversation between a user and Netai is readable from the dashboard — by
// the founder's own admin login only, nobody else's; temporary; switched off
// by a date. Two settings: PILOT_CONVERSATION_READER_UNTIL (ISO; unset = off)
// and PILOT_CONVERSATION_READER_USER_ID (default 501). Every read is logged.
//   GET /admin/pilot/threads?user_id=171078          — that user's threads
//   GET /admin/pilot/threads/:id/messages            — one conversation
/**
 * Ticket 19 [16], the founder's answer of 13 September: the reader opens for
 * the one shared admin login, and switches off on "the last day of the 14-day
 * pilot, whatever the launch date".
 *
 * A date alone does not keep that promise. Nothing stopped the date being set
 * to next year, and "temporary" becomes permanent the day somebody types a far
 * date and forgets — which is the exact risk raised when this was agreed. So
 * the window itself is bounded: a date further out than this is refused, and
 * the reader stays shut until a real one is set. Renewing is one variable;
 * drifting is not possible.
 */
const PILOT_READER_MAX_WINDOW_DAYS = 45;

export function pilotReaderAllowed(req: Request): { allowed: boolean; reason?: string } {
  const until = process.env.PILOT_CONVERSATION_READER_UNTIL;
  if (!until) {
    return {
      allowed: false,
      reason:
        'the pilot reader is switched off — set PILOT_CONVERSATION_READER_UNTIL to the last ' +
        'day of the pilot, and PILOT_CONVERSATION_READER_USER_IDS to the admin id that reads',
    };
  }
  const endsAt = new Date(until);
  if (Number.isNaN(endsAt.getTime())) {
    return { allowed: false, reason: 'the pilot reader end date is not a date' };
  }
  if (new Date() > endsAt) return { allowed: false, reason: 'the pilot reader has ended' };
  const daysOut = (endsAt.getTime() - Date.now()) / 86_400_000;
  if (daysOut > PILOT_READER_MAX_WINDOW_DAYS) {
    return {
      allowed: false,
      reason:
        `the pilot reader end date is ${Math.round(daysOut)} days out; at most ` +
        `${PILOT_READER_MAX_WINDOW_DAYS} is allowed. Reading other people's conversations is ` +
        'temporary by decision — set a date inside the pilot and renew it if the pilot is extended',
    };
  }
  // Ticket 13 Task 16: the founder's admin session was refused because his
  // own account (501) has no admin login — he signs in as another admin. The
  // reader accepts a LIST of admin ids (PILOT_CONVERSATION_READER_USER_IDS,
  // comma-separated; the singular variable still works), so the login he
  // actually uses can be named without opening the reader to every admin.
  const readers = new Set(
    (
      process.env.PILOT_CONVERSATION_READER_USER_IDS ??
      process.env.PILOT_CONVERSATION_READER_USER_ID ??
      '501'
    )
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== ''),
  );
  const adminId = String((req as AuthenticatedRequest).user.userId);
  if (!readers.has(adminId))
    return {
      allowed: false,
      reason: `only the founder’s account may read (admin ${adminId} is not it)`,
    };
  return { allowed: true };
}

/**
 * A user token for one of the FICTIONAL test accounts — the seat's 361 and
 * 370, scoped down until it was safe to build.
 *
 * Their first ask was „act as a named test user", which I refused on
 * 20 September: as written it was a way to become anybody. Their 370 scoped
 * it to „only fictional test accounts, never a real person's login, and we are
 * not asking for one", which is a test fixture rather than an authentication
 * bypass.
 *
 * It adds no new way in. The caller is already an authenticated admin — this
 * router demands that before any handler runs — so the route converts a
 * session they hold into a token for an account belonging to nobody. The six
 * ids are hardcoded in `testSeatTokens.ts`, verified against the database
 * before being written down, and anything else is refused by name.
 *
 * Logged with both ids, because „who acted as Test 3" must have an answer.
 */

/**
 * ROW 258 (D466) — take named CLOSED goals out of their owner's own list.
 *
 * `POST /admin/goals/hidden`    {"task_ids":[2839,2840],"reason":"why"}
 * `DELETE /admin/goals/hidden`  {"task_ids":[2839]}         the undo
 * `GET /admin/goals/hidden?user_id=501`   what is currently hidden
 *
 * The founder chose this over D450's stop-and-remove, which would have sent
 * „no longer needed" to three real people who had already been asked. Not
 * deleted, not closed, not stopped: not listed.
 *
 * IDS ONLY, NEVER A RULE. There is deliberately no „hide everything closed
 * before X" here: 261 of one account's goals are closed and nobody has read
 * them all, so a rule applied to unread rows is how one goal somebody wanted
 * disappears. Every id in this table was named by a person.
 *
 * AN OPEN GOAL IS REFUSED BY THE SERVICE, not by this handler, so the seat's
 * check — the open-goal count does not move — cannot be got round by a
 * different caller.
 */
adminRouter.post(
  '/goals/hidden',
  body('task_ids').isArray({ min: 1, max: 500 }),
  body('reason').isString().trim().isLength({ min: 3, max: 500 }),
  async (req: Request, res: Response) => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({
        success: false,
        error: 'task_ids (1-500) and reason (3-500 chars) are required.',
      });
      return;
    }
    const admin = (req as AuthenticatedRequest).user.userId;
    const { task_ids: taskIds, reason } = req.body as { task_ids: unknown[]; reason: string };
    try {
      // Row 258: ONE call for the whole list. The first version looped, two
      // round trips per goal; pointed at the real 221 it made 442 of them and
      // the gateway cut the connection at 127, leaving the caller with no
      // answer about what had happened.
      const outcomes: Record<string, string> = {};
      const ids: number[] = [];
      for (const raw of taskIds) {
        const id = Number(raw);
        if (Number.isInteger(id) && id > 0) ids.push(id);
        else outcomes[String(raw)] = 'not_an_id';
      }
      for (const [id, outcome] of await hideGoals(ids, `admin:${admin}`, reason)) {
        outcomes[String(id)] = outcome;
      }
      // eslint-disable-next-line no-console
      console.log(`[hidden-goals] admin ${admin} hid ${taskIds.length} goal(s) — ${reason}`);
      res.status(200).json({ success: true, data: outcomes });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[hidden-goals] hide failed:', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

adminRouter.delete(
  '/goals/hidden',
  body('task_ids').isArray({ min: 1, max: 500 }),
  async (req: Request, res: Response) => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({ success: false, error: 'task_ids (1-500) is required.' });
      return;
    }
    const admin = (req as AuthenticatedRequest).user.userId;
    const { task_ids: taskIds } = req.body as { task_ids: unknown[] };
    try {
      let restored = 0;
      for (const raw of taskIds) {
        const id = Number(raw);
        if (Number.isInteger(id) && id > 0 && (await unhideGoal(id))) restored += 1;
      }
      // eslint-disable-next-line no-console
      console.log(`[hidden-goals] admin ${admin} restored ${restored} goal(s) to the list`);
      res.status(200).json({ success: true, data: { restored } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[hidden-goals] restore failed:', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

adminRouter.get('/goals/hidden', async (req: Request, res: Response) => {
  const userId = String(req.query.user_id ?? '').trim();
  if (!userId) {
    res.status(400).json({ success: false, error: 'user_id is required.' });
    return;
  }
  try {
    res.status(200).json({ success: true, data: await hiddenGoals(userId) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[hidden-goals] list failed:', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

/**
 * ROW 251 — THE TESTER MAKES THEIR OWN FICTIONAL SEATS.
 *
 * `POST /admin/test-accounts`   {"name":"Netai Test 12","holds":["+1202555…"],
 *                                "tokens":500,"note":"row 251 triangle"}
 *
 * AUTHORIZED TWICE, which is what the founder himself asked for. D464,
 * 23 September: „you need the permission from me and from Misho to create test
 * accounts because you are the main tester… I have approved it." His own
 * sentence names both, and a quote relayed through the tester's box is data
 * rather than the second half of a permission, so this waited for Misho's word
 * to me directly. He gave it the same hour. Registered in
 * `docs/ADMIN_WRITE_OPERATIONS.md` before it ran once.
 *
 * WHAT IT CANNOT REACH, and none of it is this handler's promise — every line
 * is enforced in `testSeatCreate.service`, where it cannot be edited around:
 *
 *   * any existing account. Every write is an INSERT of a row it just made.
 *   * a number of its own choosing. The caller cannot pass a phone; the
 *     service takes the first slot in the range reserved worldwide for fiction
 *     that is registered to nobody AND saved in nobody's phonebook. That
 *     second half is the one that matters: Netai Test 5 sits on a number a
 *     real owner had had since August.
 *   * a real person in the new seat's phonebook. `holds` must be seats, and a
 *     phone that is not one is refused by name rather than skipped.
 *
 * THE UNDO IS NOT A DELETE, and that is deliberate — D245 says a goal is never
 * deleted, and an account is a heavier thing than a goal. A seat that should
 * not exist is emptied and left: set its tokens to zero with the top-up route
 * and say so in the note. If one ever has to go, that is a separate decision
 * with a separate register entry.
 */
adminRouter.post(
  '/test-accounts',
  body('name').isString().trim().isLength({ min: 1, max: 60 }),
  body('note').isString().trim().isLength({ min: 3, max: 500 }),
  body('tokens').optional().isInt({ min: 0, max: MAX_ADMIN_TOKEN_ADJUSTMENT }),
  body('holds').optional().isArray({ max: 20 }),
  body('invited_by').optional().isInt({ min: 1 }).withMessage('invited_by must be a seat user id'),
  async (req: Request, res: Response) => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({
        success: false,
        error:
          'name (1-60) and note (3-500) are required; tokens, holds, legacy_ally and invited_by are optional.',
      });
      return;
    }
    const admin = (req as AuthenticatedRequest).user.userId;
    const { name, note, tokens, holds, legacy_ally, invited_by } = req.body as {
      name: string;
      note: string;
      tokens?: number;
      holds?: unknown[];
      legacy_ally?: boolean;
      invited_by?: number;
    };
    try {
      const seat = await createTestSeat(
        name,
        (holds ?? []).map(String),
        tokens ?? DEFAULT_SEAT_TOKENS,
        `admin:${admin}`,
        note,
        // `legacy_ally: true` makes a seat shaped like one of the 62,163 old
        // Ally accounts — no Netai activity, no subscription, the flag false —
        // so the login gate the founder asked for on 24 September can be
        // proven on a fiction. Absent or false gives the ordinary working seat.
        // `invited_by: <seat user id>` puts the new seat through the INVITATION
        // half of registration — the product's own gate resolves the inviter
        // and the product's own grant decides the free period. It is the only
        // way the free days (D485) can be observed at all: this route inserts
        // an account, it does not register one, and the grant lives on the
        // registration path. The inviter must itself be a seat.
        { legacyAlly: legacy_ally === true, invitedBy: invited_by?.toString() },
      );
      res.status(201).json({ success: true, data: seat });
    } catch (error) {
      if (error instanceof SeatCreationRefused) {
        // eslint-disable-next-line no-console
        console.warn(`[test-seat] admin ${admin} refused: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      // eslint-disable-next-line no-console
      console.error('[test-seat] create failed:', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

/**
 * `POST /admin/registration-gate-check`  { "invited_by": 171873 }
 *                                        { "referral_code": "WHATEVER" }
 *                                        { }                 ← nobody invited them
 *
 * ASK THE REGISTRATION GATE ITS VERDICT AND CREATE NOTHING.
 *
 * The tester, 24 September, on why they could not prove the REFUSAL legs of
 * `invite_personal_code_only`:
 *
 *   „No code — NOT PROVABLE through the route. Netai Test 28, no invited_by →
 *   201, active pro, no inviter. We read that as the route's plain seat path
 *   skipping the registration gate, not as the gate letting a no-code person
 *   in — but we cannot tell those apart from here."
 *
 * That is exactly right, and it is the distinction this whole month keeps
 * turning on: **a thing that never ran and a thing that ran and allowed look
 * identical from outside.** The seat route inserts an account; it does not
 * register one, so a 201 there says nothing at all about the gate.
 *
 * So the gate is asked directly. It is a READ — `checkRegistrationEligibility`
 * only ever SELECTs — and nothing is created, which is the point: a refusal
 * test whose failure mode is „it made an account anyway" is not a refusal test.
 *
 * The phone is the first free slot in the fictional range, never a caller's:
 * an unknown number nobody has saved, which is the shape of the person the
 * social-proof door exists for.
 */
adminRouter.post(
  '/registration-gate-check',
  body('invited_by').optional().isInt({ min: 1 }),
  body('referral_code').optional().isString().trim().isLength({ max: 32 }),
  // A seat id whose OWN referral code should be used. The code is resolved
  // server-side and never returned: a referral code is a credential (D149),
  // which is why no admin page prints one and why the tester could not
  // exercise this branch at all.
  body('invited_by_code').optional().isInt({ min: 1 }),
  // A specific fictional number instead of the next free one — the ONLY way
  // the social-proof door can be reached, because that door is about a number
  // other people already have saved and every seat's number is registered.
  body('phone').optional().isString().trim().isLength({ max: 20 }),
  async (req: Request, res: Response) => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({
        success: false,
        error: 'invited_by must be a seat user id; referral_code at most 32 characters.',
      });
      return;
    }
    const {
      invited_by,
      invited_by_code,
      referral_code,
      phone: asked,
    } = req.body as {
      invited_by?: number;
      invited_by_code?: number;
      referral_code?: string;
      phone?: string;
    };
    try {
      /**
       * ⚠️ A CALLER MAY NAME A NUMBER HERE, AND ONLY A FICTIONAL ONE.
       *
       * Everywhere else in this file the rule is that the caller cannot pass a
       * phone, because a number handed in is a number nobody checked. The rule
       * holds here too — `isFictionalSlot` accepts exactly the hundred slots in
       * the block reserved worldwide for fiction and nothing else, so a real
       * person's number cannot be asked about. What it buys is the social-proof
       * door: that door is about a number OTHER people already have saved, and
       * the next free slot is by definition saved by nobody.
       */
      if (asked !== undefined && !isFictionalSlot(asked)) {
        res.status(400).json({
          success: false,
          error: 'phone must be one of the fictional slots; a real number is never asked about',
        });
        return;
      }
      const phone = asked ?? (await firstFreeFictionalPhone());
      const inviterPhone =
        invited_by === undefined ? undefined : await inviterSeatPhone(String(invited_by));
      const code =
        invited_by_code === undefined
          ? referral_code
          : await inviterSeatReferralCode(String(invited_by_code));
      const gate = await checkRegistrationEligibility(phone, inviterPhone, code);

      res.status(200).json({
        success: true,
        data: {
          // What the gate said, unedited. `eligible: false` is the refusal the
          // real registration would turn into a message for the person.
          eligible: gate.eligible,
          mode: gate.mode ?? null,
          reason: gate.reason ?? null,
          inviter_resolved: gate.inviterUserId ?? null,
          cohort_code: gate.cohortCode ?? null,
          // Stated so nobody has to take it on trust.
          created: 'nothing',
          asked_for_phone: phone,
        },
      });
    } catch (error) {
      if (error instanceof SeatCreationRefused) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      // eslint-disable-next-line no-console
      console.error('[gate-check] failed:', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

/**
 * `GET /admin/launch-window` — does the launch cohort exist at all?
 *
 * ⚠️ IT ANSWERS A QUESTION THAT IS ABOUT TO COST SOMEBODY THEIR FREE DAYS.
 *
 * Twenty days are promised twice: a launch-window invitee gets the cohort's
 * `trial_days` (D137), an ordinary invitee now gets the `invite_free_days`
 * setting. Both are 20 today, so nothing can be seen. **The moment the founder
 * lowers the setting to 10 or 5 — which he said he would — they diverge**, and
 * if the launch path is not configured, somebody he invited personally gets the
 * lower number instead of the twenty he promised, with no error anywhere.
 *
 * Measured 24 September: **no account has ever been granted a cohort trial.**
 * So „the launch path fires" has never once been observed, and the answer sat
 * in an environment variable nobody had looked at.
 *
 * **The referrer ids are the founder's own accounts and are NOT returned** — a
 * count and the dates answer the question without naming anyone.
 */
adminRouter.get('/launch-window', (_req: Request, res: Response) => {
  res.status(200).json({ success: true, data: launchWindowStatus() });
});

/**
 * `POST /admin/login-gate-check`  { "user_id": 4511 }
 *
 * WHAT THE LOGIN GATE WOULD DO TO ONE ACCOUNT, LOGGING NOBODY IN.
 *
 * The tester, minutes after the gate went on: „Real login: we cannot. It needs
 * a login code and this seat never types one." The same wall the registration
 * gate hit, and the same answer: **a switch that refuses people with no way to
 * see the refusal is a switch nobody can check.**
 *
 * It asks the same condition `completeLogin` asks, through the same shared SQL
 * fragment, and reads the same flag. Nothing is written and no session is
 * minted — the OTP is what makes a login a login and it is not consulted here,
 * so this cannot let anybody in.
 */
adminRouter.post(
  '/login-gate-check',
  body('user_id').isInt({ min: 1 }).withMessage('user_id is required'),
  async (req: Request, res: Response) => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({ success: false, error: 'user_id is required' });
      return;
    }
    try {
      const { user_id } = req.body as { user_id: number };
      res.status(200).json({ success: true, data: await loginGateVerdict(user_id) });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[login-gate-check] failed:', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

/** Every seat that can be operated: the eleven in source, plus the made ones. */
adminRouter.get('/test-accounts', async (_req: Request, res: Response) => {
  try {
    const made = await createdTestSeats();
    res.status(200).json({
      success: true,
      data: { in_source: fictionalTestAccountIds(), created: made },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[test-seat] list failed:', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.post('/test-seat/token', async (req: Request, res: Response) => {
  const secret = process.env.JWT_SECRET ?? '';
  if (!secret) {
    res.status(500).json({ success: false, error: 'JWT_SECRET is not configured' });
    return;
  }
  const requested = String((req.body as { user_id?: unknown })?.user_id ?? '').trim();
  if (!requested) {
    res.status(400).json({
      success: false,
      error: 'user_id is required',
      available: fictionalTestAccountIds(),
    });
    return;
  }
  const admin = (req as AuthenticatedRequest).user.userId;
  try {
    // Row 251: a seat this route created is not in the hardcoded Set and never
    // can be — the Set is in source so it cannot be widened at runtime. The
    // database read is what vouches for it, and it throws rather than saying
    // „not a test account" when it cannot see the table.
    const verified = await isOperableTestSeat(requested, isFictionalTestAccount);
    const minted = mintTestSeatToken(requested, secret, verified);
    // eslint-disable-next-line no-console
    console.log(`[test-seat] admin ${admin} minted a token for test account ${minted.userId}`);
    res.status(200).json({ success: true, data: minted });
  } catch (error) {
    if (error instanceof NotATestAccountError) {
      // eslint-disable-next-line no-console
      console.warn(`[test-seat] admin ${admin} asked for ${requested} — REFUSED, not fictional`);
      res.status(403).json({
        success: false,
        error: error.message,
        available: fictionalTestAccountIds(),
      });
      return;
    }
    // eslint-disable-next-line no-console
    console.error('[test-seat] mint failed:', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

/**
 * §19 — tokens for a fictional test account. Registered in
 * `docs/ADMIN_WRITE_OPERATIONS.md` before a line of it was written, which is
 * what D44 asks for, and authorised by Misho on 21 September („netAI-ს
 * ტოკენების დამატებაზე თუ არის საუბარი დაუმატე").
 *
 * WHAT IT NARROWS. The four `admin_adjust` rows in the ledger were typed
 * straight into the database in July — 999,999 tokens to one real account,
 * 100,000 to another — with no external_id, no note, no code. This route
 * reaches the fictional accounts and nothing else, caps a call at
 * ±50,000, demands a written reason, and records where the row came from.
 * A real person's wallet is not available through it.
 *
 * THE UNDO IS THE SAME CALL WITH THE NUMBER NEGATED, which is why the amount
 * is signed. A reversal is a row beside the grant rather than a deletion.
 */
/**
 * §54 — RENAME A FICTIONAL SEAT. Registered before it was run, as D44 requires.
 *
 * It exists because a refusal made rows nobody asked for: on 25 September a
 * call the route REFUSED had already written the account, its phone and its
 * `test_seats` row, twice — 172531 and 172532, both „Netai Test 42". The
 * creating bug is fixed (§53); these are what it left.
 *
 * Misho chose renaming over deleting. A delete here has NO UNDO — a new seat
 * would take a new id on a new slot — and a name can be set again in a second.
 *
 * THE SAME GUARD AS THE TOKENS ROUTE, and for the same reason: only an id that
 * `test_seats` knows may be touched, so a real person is refused by name
 * before anything is written. `renameTestSeat` then scopes its own writes to
 * seats a second time.
 */
adminRouter.post(
  '/test-accounts/:id/name',
  param('id').isString().trim().notEmpty(),
  body('name').isString().trim().isLength({ min: 1, max: 60 }),
  body('note').isString().trim().isLength({ min: 3, max: 500 }),
  async (req: Request, res: Response) => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({
        success: false,
        error: 'name (1-60) is required, and note must say why (3-500 chars).',
      });
      return;
    }
    const target = String(req.params.id).trim();
    const admin = (req as AuthenticatedRequest).user.userId;
    if (!(await isOperableTestSeat(target, isFictionalTestAccount))) {
      // eslint-disable-next-line no-console
      console.warn(`[test-rename] admin ${admin} asked for ${target} — REFUSED, not fictional`);
      res.status(403).json({
        success: false,
        error: new NotATestAccountError(target).message,
        available: fictionalTestAccountIds(),
      });
      return;
    }
    const { name, note } = req.body as { name: string; note: string };
    try {
      const was = await query<{ name: string }>(
        `SELECT name FROM test_seats WHERE user_id = $1::int`,
        [target],
      );
      const renamed = await renameTestSeat(target, name);
      if (renamed === null) {
        res.status(404).json({ success: false, error: 'No such seat.' });
        return;
      }
      // The old name is printed so the undo is in the log beside the change.
      // eslint-disable-next-line no-console
      console.log(
        `[test-rename] admin ${admin} renamed seat ${target}: ` +
          `"${was.rows[0]?.name ?? '?'}" -> "${renamed}" — ${String(note).trim()}`,
      );
      res.status(200).json({
        success: true,
        data: { user_id: target, was: was.rows[0]?.name ?? null, name: renamed },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[test-rename]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

/**
 * §57 — TOP UP A REAL PERSON'S WALLET. Registered before it was written, as
 * D44 requires, and authorised by Misho on 25 September: „ნინიას საფულე
 * შეავსე."
 *
 * ⚠️ THIS IS THE THING §19 WAS WRITTEN TO AVOID. That route is guarded by
 * `isOperableTestSeat` and CANNOT reach a real person — which is the whole
 * reason it was allowed to exist. Ninia Abramishvili is a real account, so §19
 * refuses her, and it is right to.
 *
 * So this capability is new, and it is narrow on purpose: one signed amount,
 * a written reason, the same ±50,000 ceiling §19 uses (the July hand-typed
 * rows were 999,999 and 100,000, which is what that ceiling exists to make
 * impossible), and a log line naming the PERSON and the before and after.
 *
 * A TEST SEAT IS REFUSED HERE and pointed at §19. One door each, so what each
 * route can reach is a sentence rather than a guess.
 *
 * THE UNDO IS THE SAME CALL WITH THE NUMBER NEGATED, which is why the amount
 * is signed: a reversal is a row beside the grant, never a deletion. `was`
 * comes back in the reply so the undo does not depend on reading a log.
 */
adminRouter.post(
  '/users/:id/tokens',
  param('id').isString().trim().notEmpty(),
  body('tokens').isInt({ min: -MAX_ADMIN_TOKEN_ADJUSTMENT, max: MAX_ADMIN_TOKEN_ADJUSTMENT }),
  body('note').isString().trim().isLength({ min: 3, max: 500 }),
  async (req: Request, res: Response) => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({
        success: false,
        error:
          `tokens must be a non-zero integer within ±${MAX_ADMIN_TOKEN_ADJUSTMENT}, ` +
          'and note must say why (3-500 chars).',
      });
      return;
    }
    const target = String(req.params.id).trim();
    const admin = (req as AuthenticatedRequest).user.userId;
    const { tokens, note } = req.body as { tokens: number; note: string };
    if (Number(tokens) === 0) {
      res.status(400).json({ success: false, error: 'tokens must not be zero.' });
      return;
    }
    try {
      const who = await query<{ name: string | null; seat: boolean }>(
        `SELECT NULLIF(TRIM(u.name), '') AS name,
                EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = u.id) AS seat
           FROM "User" u
          WHERE u.id = $1::int AND u."deletedAt" IS NULL`,
        [target],
      );
      const person = who.rows[0];
      if (!person) {
        res.status(404).json({ success: false, error: 'No such account.' });
        return;
      }
      if (person.seat) {
        // eslint-disable-next-line no-console
        console.warn(`[user-tokens] admin ${admin} aimed at test seat ${target} — REFUSED`);
        res.status(400).json({
          success: false,
          error: 'That is a fictional test seat — use POST /admin/test-accounts/:id/tokens.',
        });
        return;
      }
      const was = await getBalance(target);
      const balance = await adjustTestAccountTokens(
        target,
        Number(tokens),
        String(note).trim(),
        `admin:${randomUUID()}`,
      );
      // The person is NAMED and both balances are printed: a wallet that moved
      // must be traceable to a call and a reason without a database read.
      // eslint-disable-next-line no-console
      console.log(
        `[user-tokens] admin ${admin} adjusted ${person.name ?? target} (${target}) ` +
          `by ${tokens}: ${was} -> ${balance} — ${String(note).trim()}`,
      );
      res.status(200).json({
        success: true,
        data: { user_id: target, person: person.name, was, tokens: Number(tokens), balance },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[user-tokens]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

adminRouter.post(
  '/test-accounts/:id/tokens',
  param('id').isString().trim().notEmpty(),
  body('tokens').isInt({ min: -MAX_ADMIN_TOKEN_ADJUSTMENT, max: MAX_ADMIN_TOKEN_ADJUSTMENT }),
  body('note').isString().trim().isLength({ min: 3, max: 500 }),
  async (req: Request, res: Response) => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({
        success: false,
        error:
          `tokens must be a non-zero integer within ±${MAX_ADMIN_TOKEN_ADJUSTMENT}, ` +
          'and note must say why (3-500 chars).',
      });
      return;
    }
    const target = String(req.params.id).trim();
    const admin = (req as AuthenticatedRequest).user.userId;
    // Row 251: the hardcoded Set, OR a seat `POST /admin/test-accounts` made —
    // recorded in `test_seats`, which is the only way a row gets there.
    if (!(await isOperableTestSeat(target, isFictionalTestAccount))) {
      // eslint-disable-next-line no-console
      console.warn(`[test-tokens] admin ${admin} asked for ${target} — REFUSED, not fictional`);
      res.status(403).json({
        success: false,
        error: new NotATestAccountError(target).message,
        available: fictionalTestAccountIds(),
      });
      return;
    }
    const { tokens, note } = req.body as { tokens: number; note: string };
    try {
      const balance = await adjustTestAccountTokens(
        target,
        tokens,
        String(note).trim(),
        `admin:${randomUUID()}`,
      );
      // eslint-disable-next-line no-console
      console.log(
        `[test-tokens] admin ${admin} adjusted test account ${target} by ${tokens} ` +
          `— balance ${balance} — ${String(note).trim()}`,
      );
      res.status(200).json({
        success: true,
        data: { user_id: target, adjusted_by: tokens, balance, note: String(note).trim() },
      });
    } catch (error) {
      if (error instanceof TokenAdjustmentOutOfRange) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      // eslint-disable-next-line no-console
      console.error('[test-tokens] adjust failed:', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

/**
 * Row 16 — WHOSE conversation to open, which was the missing first step.
 *
 * Both reading routes below need a `user_id` and nothing answered „who are the
 * pilot's people". Thirteen accounts sit inside 62,233, and the founder cannot
 * type an id he has never seen.
 *
 * BEHIND THE SAME GATE AS THE READING. A list that names the pilot's members
 * is not a lesser capability than reading them, and putting it behind a weaker
 * door would lose the point of the door. No phone number, not even the last
 * four (D149) — a name to show and an id to fetch with is all a screen needs.
 */
adminRouter.get('/pilot/people', async (req: Request, res: Response) => {
  try {
    const gate = pilotReaderAllowed(req);
    if (!gate.allowed) {
      res.status(403).json({ success: false, error: gate.reason });
      return;
    }
    // eslint-disable-next-line no-console
    console.log(
      `[pilot-reader] the pilot's people listed by admin ${(req as AuthenticatedRequest).user.userId}`,
    );
    const people = await pilotPeople();
    res.status(200).json({ success: true, data: { total: people.length, people } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin pilot people]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.get('/pilot/threads', async (req: Request, res: Response) => {
  try {
    const gate = pilotReaderAllowed(req);
    if (!gate.allowed) {
      res.status(403).json({ success: false, error: gate.reason });
      return;
    }
    const userId = Number(req.query.user_id);
    if (!Number.isFinite(userId) || userId <= 0) {
      res.status(400).json({ success: false, error: 'user_id აუცილებელია' });
      return;
    }
    // eslint-disable-next-line no-console
    console.log(
      `[pilot-reader] threads of ${userId} read by admin ${(req as AuthenticatedRequest).user.userId}`,
    );
    const threads = await getThreadsForUser(String(userId));
    res
      .status(200)
      .json({ success: true, data: { user_id: userId, total: threads.length, threads } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin pilot threads]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.get('/pilot/threads/:id/messages', async (req: Request, res: Response) => {
  try {
    const gate = pilotReaderAllowed(req);
    if (!gate.allowed) {
      res.status(403).json({ success: false, error: gate.reason });
      return;
    }
    const threadId = Number(req.params.id);
    if (!Number.isFinite(threadId) || threadId <= 0) {
      res.status(400).json({ success: false, error: 'id აუცილებელია' });
      return;
    }
    // eslint-disable-next-line no-console
    console.log(
      `[pilot-reader] thread ${threadId} read by admin ${(req as AuthenticatedRequest).user.userId}`,
    );
    const messages = await getThreadMessages(threadId);
    res.status(200).json({ success: true, data: { thread_id: threadId, messages } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin pilot messages]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// D138 (8 Sep): a title that has ended is a PAST job — kept and findable, never
// the current one. Moves one fact to another field type and returns the type
// it had; the same call with `from` undoes it.
//   POST /admin/facts/:id/field-type { field_type: "past_role" }
adminRouter.post('/facts/:id/field-type', async (req: Request, res: Response) => {
  try {
    const factId = Number(req.params.id);
    const body = req.body as { field_type?: unknown };
    const fieldType = typeof body.field_type === 'string' ? body.field_type.trim() : '';
    if (!Number.isFinite(factId) || factId <= 0 || fieldType === '') {
      res.status(400).json({ success: false, error: 'id და field_type აუცილებელია' });
      return;
    }
    const moved = await retypeFact(factId, fieldType);
    if (moved === null) {
      res.status(404).json({ success: false, error: 'ასეთი ფაქტი არ არის' });
      return;
    }
    res.status(200).json({ success: true, data: moved });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin fact retype]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

//   GET /admin/goals/:taskId            — the goal, whoever owns it
//   GET /admin/goals/:taskId?user_id=   — the same, refused unless that user owns it
adminRouter.get('/goals/:taskId', async (req: Request, res: Response) => {
  try {
    const rawUserId = req.query.user_id === undefined ? null : Number(req.query.user_id);
    const taskId = Number(req.params.taskId);
    if (!Number.isFinite(taskId) || taskId <= 0 || (rawUserId !== null && !(rawUserId > 0))) {
      res.status(400).json({ success: false, error: 'taskId აუცილებელია' });
      return;
    }
    const goal = await adminGoalDetail(rawUserId === null ? null : String(rawUserId), taskId);
    if (goal === null) {
      res.status(404).json({ success: false, error: 'მიზანი ვერ მოიძებნა' });
      return;
    }
    res.status(200).json({ success: true, data: { goal } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin goal detail]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// The 14-day acceptance table (the standard, Part I §3), one row per day, read
// in one call instead of filled by hand each morning.
//   GET /admin/goals/:taskId/days?user_id=501&days=14
adminRouter.get('/goals/:taskId/days', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.query.user_id);
    const taskId = Number(req.params.taskId);
    if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(taskId) || taskId <= 0) {
      res.status(400).json({ success: false, error: 'user_id და taskId აუცილებელია' });
      return;
    }
    const rawDays = Number(req.query.days);
    const report = await goalDays(
      String(userId),
      taskId,
      Number.isFinite(rawDays) && rawDays > 0 ? rawDays : undefined,
    );
    if (report === null) {
      res.status(404).json({ success: false, error: 'მიზანი ვერ მოიძებნა' });
      return;
    }
    res.status(200).json({ success: true, data: report });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin goal days]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Take back a question filed against the wrong goal. The owner's pending list
// is the one place a goal speaks for itself — a question that is not that
// goal's own must be removable without waiting three days for its next wake.
adminRouter.delete('/goals/:taskId/question', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.query.user_id);
    const taskId = Number(req.params.taskId);
    if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(taskId) || taskId <= 0) {
      res.status(400).json({ success: false, error: 'user_id და taskId აუცილებელია' });
      return;
    }
    const result = await retractGoalQuestion(String(userId), taskId);
    if (!result.retracted) {
      res.status(404).json({ success: false, error: result.error ?? 'ვერ მოიძებნა' });
      return;
    }
    res.status(200).json({ success: true, data: { task_id: taskId, retracted: true } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin goal question retract]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// The founder's own decision on his own memory (D94/D95) had nowhere to run:
// the self-service route needs his session, and an operator carrying out a
// written instruction should not be borrowing it. Same service functions,
// same owner scoping, admin-authenticated and logged.
adminRouter.delete('/users/:id/memory', async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.id ?? '');
    const body = req.body as {
      context_keys?: unknown;
      note_ids?: unknown;
      profile_keys?: unknown;
    };
    const keys = Array.isArray(body.context_keys) ? body.context_keys.map(String) : [];
    const noteIds = Array.isArray(body.note_ids)
      ? body.note_ids.map(Number).filter((n) => Number.isFinite(n))
      : [];
    const profileKeys = Array.isArray(body.profile_keys) ? body.profile_keys.map(String) : [];
    if (!userId || (keys.length === 0 && noteIds.length === 0 && profileKeys.length === 0)) {
      res.status(400).json({ success: false, error: 'user id და წასაშლელი სია აუცილებელია' });
      return;
    }
    const [context, notes, profile] = await Promise.all([
      deletePrivateContextKeys(userId, keys),
      deleteUserNotes(userId, noteIds),
      deleteUserProfileFields(userId, profileKeys),
    ]);
    // eslint-disable-next-line no-console
    console.log(
      `[admin memory] user ${userId}: ${context.deleted} context key(s), ` +
        `${notes.deleted} note(s), ${profile.deleted} profile line(s) deleted`,
    );
    res.status(200).json({
      success: true,
      data: {
        context_deleted: context.deleted,
        notes_deleted: notes.deleted,
        profile_deleted: profile.deleted,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin memory delete]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// The other half of a memory correction: D95 did not only delete lines, it
// also extended one ("it is true, but additionally in real estate development
// business, and in Ally"). Profile keys only — the private context and the
// notes are the assistant's own writing and are corrected by deleting.
adminRouter.put('/users/:id/memory', async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.id ?? '');
    const { key, value } = req.body as { key?: unknown; value?: unknown };
    if (!userId || typeof key !== 'string' || !key.trim() || typeof value !== 'string') {
      res.status(400).json({ success: false, error: 'key და value აუცილებელია' });
      return;
    }
    await setUserProfileField(userId, key.trim(), value, 'set');
    // eslint-disable-next-line no-console
    console.log(`[admin memory] user ${userId}: profile line "${key.trim()}" set`);
    res.status(200).json({ success: true, data: { key: key.trim(), value } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin memory set]', error);
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
// D40 (ticket 8 task 14): one contact's raw labels, aggregated with the
// contributor identity and count behind each, next to the parsed conclusion.
// Reads the stores where every raw label already lives with its writer —
// nothing is discarded at parse time; this is the read that proves it.
// Ticket 9 task 9: load Lika's researched profiles at the database level.
// The body carries the raw files; the server parses them, so the private
// section is cut here rather than trusted to have been cut by the caller.
//
// `dry_run` defaults to TRUE. The task's own warning is that name matching put
// six facts on the wrong people last time, so the safe direction is the
// default one: resolve everything, write nothing, and let a human read the
// ambiguous list before anybody commits.
adminRouter.post('/profiles/import', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      files?: unknown;
      curator_user_id?: unknown;
      dry_run?: unknown;
      phone_by_name?: unknown;
    };
    if (!Array.isArray(body.files) || body.files.length === 0) {
      res.status(400).json({ success: false, error: 'files აუცილებელია' });
      return;
    }
    const curatorUserId = String(body.curator_user_id ?? '').trim();
    if (!/^\d+$/.test(curatorUserId)) {
      res.status(400).json({ success: false, error: 'curator_user_id აუცილებელია' });
      return;
    }
    const profiles: ParsedProfile[] = [];
    for (const file of body.files) {
      const parsed = parseProfile(String(file));
      if (parsed) profiles.push(parsed);
    }
    if (profiles.length === 0) {
      res.status(400).json({ success: false, error: 'არცერთი ფაილი არ იკითხება' });
      return;
    }
    const dryRun = body.dry_run !== false;
    // Lika's own answers, keyed by the profile name. A supplied number is the
    // answer, not a hint — the matcher only runs for the names left blank.
    const overrides: Record<string, string> = {};
    if (body.phone_by_name && typeof body.phone_by_name === 'object') {
      for (const [name, phone] of Object.entries(body.phone_by_name as Record<string, unknown>)) {
        const value = String(phone ?? '').trim();
        if (value !== '') overrides[name] = value;
      }
    }
    res.status(200).json({
      success: true,
      data: await importProfiles(profiles, curatorUserId, dryRun, overrides),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin profiles import]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Ticket 9 task 24 question 2: who imported, when, and how it went. The
// August question ("which accounts imported between the upgrade and the fix")
// was unanswerable because nothing recorded an attempt — only a log line that
// ages out. `failed_only` is the read that matters: an import that saved
// nothing from non-empty input is the silent data-loss shape that ran for 16
// days without anyone seeing it.
adminRouter.get('/import-attempts', async (req: Request, res: Response) => {
  try {
    const rawDays = Number(req.query.days);
    const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(rawDays, 365) : 30;
    const rawUserId = String(req.query.user_id ?? '').trim();
    const userId = /^\d+$/.test(rawUserId) ? Number(rawUserId) : null;
    const failedOnly = req.query.failed_only === 'true';
    const attempts = await listImportAttempts({ days, userId, failedOnly });
    res.status(200).json({ success: true, data: attempts });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin import-attempts]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.get('/contacts/raw-labels', async (req: Request, res: Response) => {
  try {
    const phone = String(req.query.phone ?? '').trim();
    if (phone.replace(/\D/g, '').length < 6) {
      res.status(400).json({ success: false, error: 'phone აუცილებელია' });
      return;
    }
    res.status(200).json({ success: true, data: await getRawLabelEvidence(phone) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin raw-labels]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// The fenced-JSON repair pass (1 Sep): re-runs moderation and crowd
// confirmation over facts that were saved while every model reply parsed as a
// failure, and publishes the trusted curators' core facts. Paced by `limit`,
// idempotent — each step only looks at rows that are still private.
adminRouter.post('/facts/republish', async (req: Request, res: Response) => {
  try {
    const rawLimit = Number(req.query.limit);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(rawLimit, MAX_REPUBLISH_LIMIT)
        : DEFAULT_REPUBLISH_LIMIT;
    res.status(200).json({ success: true, data: await republishFacts(limit) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin facts republish]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

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

// Counterpart to /label-parser/reprocess-queue, for facts ALREADY saved
// rather than rows still queued — explicitly asked for on the old
// (already-parsed) list, not just new ones. Re-matches every label-sourced
// occupation fact against the label it actually came from; only writes
// when today's logic disagrees with what was saved. Synchronous — the
// table is tiny (81 rows product-wide), not a bulk job.
adminRouter.post(
  '/label-parser/reprocess-saved-facts',
  async (_req: Request, res: Response<ApiResponse<{ upgraded: number; unchanged: number }>>) => {
    try {
      const result = await reprocessSavedOccupationFacts();
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[admin label-parser reprocess-saved-facts]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// Engine T3: sent → opened → registered, for one user or the whole product
// (?user_id= narrows it) — the three events the spec asked to see in
// analytics.
/**
 * Row 256 — the pilot's results over time, in one read.
 *
 * `?days=` (1..120, default 28). Real people and fictional seats come back
 * SIDE BY SIDE and never merged, with the population rule and the date
 * closures began to be recorded travelling in the same payload — a screen
 * cannot show these numbers without the two sentences that say what they are.
 */
adminRouter.get('/pilot/report', async (req: Request, res: Response) => {
  try {
    const raw = req.query.days;
    const days = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : undefined;
    const report = await pilotReport(days);
    res.status(200).json({ success: true, data: report });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin pilot report]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

/**
 * Row 248's missing fourth fact. The fix is built and deployed and every
 * cancellation FROM THAT DAY is recorded correctly — and the person the row
 * was reported for may still be seeing the bug, because the columns are only
 * written when a Stripe event arrives and a cancel-at-period-end sends its
 * next one on the day the subscription ends.
 *
 * This compares and writes NOTHING. Repairing the rows is an admin operation
 * on live data (D44) and needs the register and a yes; how many rows are
 * actually wrong needs neither, and it is the number that decision rests on.
 */
adminRouter.get('/stripe/drift', async (req: Request, res: Response) => {
  try {
    const raw = req.query.limit;
    const limit = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : undefined;
    const report = await subscriptionDrift(limit);
    res.status(200).json({ success: true, data: report });
  } catch (error) {
    const why = (error as Error).message;
    // „I could not look" is not „nothing is wrong", and the two must not leave
    // by the same door. A server with no Stripe key cannot compare anything,
    // and saying so with 503 keeps that distinct from a comparison that ran.
    if (why.includes('not configured')) {
      res.status(503).json({ success: false, error: why });
      return;
    }
    // eslint-disable-next-line no-console
    console.error('[admin stripe drift]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

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
              ir.responded_by_user_id, rb.name AS responded_by_name,
              -- 21 September. The seat filtered 45 rows on intro_channel and
              -- got zero, and their filter could never have returned anything,
              -- because this SELECT did not carry the column. Their zero was
              -- not a stale reading; it was a reading of a field that was not
              -- in the payload at all. With rows 220 and 223 turning on this
              -- value, my database reads were the only ones anybody could
              -- make. Now they can be checked by somebody other than me.
              ir.intro_channel,
              ir.created_at, ir.responded_at
       FROM introduction_requests ir
       LEFT JOIN "User" rq ON rq.id = ir.requester_user_id
       LEFT JOIN "User" md ON md.id = ir.mediator_user_id
       LEFT JOIN "User" rb ON rb.id = ir.responded_by_user_id
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

// T6 part (b): "which needs went unmet this month, and which non-users would
// have answered them" — per T7's own dependency on this list (its "Pull"
// score input). city is the ASKER's city (the closest available "market"
// proxy — no non-user candidate has a reliable location of their own).
adminRouter.get('/unmet-needs', async (req: Request, res: Response) => {
  try {
    const rawDays = Number(req.query.days);
    const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(rawDays, 365) : 30;
    // Ticket 20 row 57, the half that was left: ?country=ge drops non-Georgian
    // candidates from the report. Opt-in and never the default — D216 is
    // „mark foreign numbers, never delete", so the unfiltered read is
    // unchanged and every candidate still carries its own `foreign` flag.
    // An unrecognised value is refused rather than quietly read as "all":
    // a filter that silently does nothing is worse than no filter.
    const rawCountry = req.query.country ?? 'all';
    if (!isCandidateCountry(rawCountry)) {
      res.status(400).json({ success: false, error: 'country: ge ან all' });
      return;
    }
    const [result, excludedUserIds] = await Promise.all([
      findUnmetNeeds(days, rawCountry),
      demandExcludedUserIds(),
    ]);
    // Ticket 7 Task 4 item 4: the T5 merge must be visible — per-topic
    // `sources` on each row plus the overall split here.
    const sourceTotals = result.reduce(
      (acc, row) => ({
        netai: acc.netai + row.sources.netai,
        old_ally: acc.old_ally + row.sources.old_ally,
      }),
      { netai: 0, old_ally: 0 },
    );
    // Ticket 10 Task 6: which accounts' searches were left out of demand (our
    // own people and the test numbers), and how many candidates are foreign —
    // named once, on the screen that shows the result of the exclusion.
    const foreignCandidates = result.reduce(
      (n, row) => n + row.candidates.filter((c) => c.foreign).length,
      0,
    );
    res.status(200).json({
      success: true,
      data: {
        topics: result,
        source_totals: sourceTotals,
        excluded_user_ids: excludedUserIds,
        // How many foreign candidates are IN THIS LIST. With country=ge that
        // is zero by construction, and `country` below is what says why —
        // the number is not a claim that none exist.
        foreign_candidates: foreignCandidates,
        country: rawCountry,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin unmet-needs]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// T7: the ranked, explainable weekly target list — built from T6's unmet
// needs (Pull) and gated in length by T10's ask capacity. Two of the spec's
// criteria flags (lookalike-to-best-users, per-user goal relevance) have no
// concept to build on in this schema and are documented, not faked — see
// targetScoring.service's own header comment.
//   GET /admin/target-list?days=30[&refresh=true][&wait=false]
// `wait=false` (Ticket 10 Task 12): when the list for that window is not
// built yet, start the build and answer 202 with its status instead of holding
// the request open for a minute — the 60-day period's first build took 68 s
// and the page showed a server error with nothing to retry. The page polls
// /target-list/status until `ready`, then reads the list. Without the flag the
// old behaviour holds, but a build already running is joined, never doubled.
adminRouter.get(
  '/target-list',
  async (req: Request, res: Response<ApiResponse<TargetScoreEntry[] | TargetListStatus>>) => {
    try {
      const days = targetListDays(req.query.days);
      // ?refresh=true rebuilds instead of serving the hourly cache — the lever
      // the founder needs right after a curator import, since the imported
      // facts are what the `fit` part of every score reads.
      const refresh = req.query.refresh === 'true';
      if (req.query.wait === 'false') {
        const status = startTargetListBuild(days, refresh);
        if (status.state !== 'ready') {
          res.status(202).json({ success: true, data: status });
          return;
        }
      }
      const result = await buildTargetList(days, { refresh });
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[admin target-list]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// Is the list for this window ready, building, or did the last build fail —
// and when. Never triggers a build; pair it with `wait=false` above.
adminRouter.get(
  '/target-list/status',
  (req: Request, res: Response<ApiResponse<TargetListStatus>>) => {
    res.status(200).json({ success: true, data: targetListStatus(targetListDays(req.query.days)) });
  },
);

function targetListDays(raw: unknown): number {
  const days = Number(raw);
  return Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 30;
}

// The gate ledger behind the same list: which check removed how many, and
// which ones are currently switched off (TARGET_GATES_OFF). A rule nobody can
// count is a rule nobody can argue with — the founder asked for exactly this,
// per exclusion, with its number.
//   GET /admin/target-list/gates?days=30&refresh=true
// `matched` is what a gate caught, `removed` what it was allowed to act on —
// they differ only for a gate named in TARGET_GATES_OFF, which then shows the
// cost of the rule without anyone having to ship a change to find out.
adminRouter.get('/target-list/gates', async (req: Request, res: Response) => {
  try {
    const rawDays = Number(req.query.days);
    const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(rawDays, 365) : 30;
    const refresh = req.query.refresh === 'true';
    const build = await buildTargetListWithGates(days, { refresh });
    res.status(200).json({
      success: true,
      data: {
        candidates_in: build.candidates_in,
        survived: build.survived,
        capacity: build.capacity,
        listed: build.entries.length,
        social_proof_basis: build.social_proof_basis,
        social_proof_min_holders: build.social_proof_min_holders,
        gates: build.gates,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin target-list gates]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

/**
 * How far the base walk has got (ticket 19).
 *   GET /admin/target-list/base-walk
 *
 * The 62,000 old-Ally accounts enter the pool through a background walk, which
 * means the one question that matters — is it actually finding anybody — is
 * invisible from outside. Read-only, and the four numbers that answer it:
 * how many candidates exist, how many are still reachable (never opened
 * Netai), where the cursor stands, and when the last pass wrote anything.
 *
 * A cursor that never moves, or a last_walk that stops advancing, is the walk
 * being dead — and that is the failure this route exists to make visible
 * rather than silent.
 */
/**
 * What the automatic research has actually done, and what it found (ticket 19
 * [20]).
 *   GET /admin/research-findings          — the runner's state
 *   GET /admin/research-findings?phone=…  — one person's whole trail
 *
 * The trail includes the steps that were NOT run, by name and with the reason.
 * That is the point of the read: „we never looked" and „we looked and found
 * nothing" are different facts about a real person, and a screen that shows
 * only findings would silently turn the first into the second.
 *
 * Read-only, and it shows evidence — a page, its words, its URL — never a
 * conclusion about anybody. Whoever reads it does the concluding.
 */
adminRouter.get('/research-findings', async (req: Request, res: Response) => {
  try {
    const phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : '';
    const status = await researchStatus();
    if (phone === '') {
      res.status(200).json({ success: true, data: { status, steps: [] } });
      return;
    }
    const steps = await researchTrail(phone);
    res.status(200).json({ success: true, data: { status, steps } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin research-findings]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

/**
 * The tester's channel, inside the panel both sides already have.
 *
 *   GET  /admin/handoff?reader=tester&since_id=12   — the thread, oldest first
 *   POST /admin/handoff   { author, body }          — one message
 *   POST /admin/handoff/read { reader, last_seen_id }
 *
 * Cross-account session messaging is refused by design, so the tester cannot be
 * reached the way the frontend session is. This is the meeting point instead:
 * one thread, visible to anyone with the panel, so Misho stops being the wire
 * and stays the reader.
 */
adminRouter.get('/handoff', async (req: Request, res: Response) => {
  try {
    const rawSince = Number(req.query.since_id);
    const rawLimit = Number(req.query.limit);
    const thread = await readHandoff({
      ...(typeof req.query.reader === 'string' && { reader: req.query.reader }),
      ...(Number.isFinite(rawSince) && rawSince > 0 && { sinceId: rawSince }),
      ...(Number.isFinite(rawLimit) && rawLimit > 0 && { limit: rawLimit }),
    });
    res.status(200).json({ success: true, data: thread });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin handoff read]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.post('/handoff', async (req: Request, res: Response) => {
  try {
    const { author, body } = req.body as { author?: unknown; body?: unknown };
    // The author is declared, never guessed. Everyone here posts through an
    // admin login, so deriving it from the session would file every line I
    // write under Misho's name — which is the one thing this must not do.
    if (!isHandoffAuthor(author)) {
      res.status(400).json({
        success: false,
        error: 'author must be one of: claude_backend, claude_frontend, tester, misho',
      });
      return;
    }
    if (typeof body !== 'string' || body.trim() === '') {
      res.status(400).json({ success: false, error: 'body is required' });
      return;
    }
    const postedBy = String((req as AuthenticatedRequest).user.userId);
    const message = await postHandoff(author, body, postedBy);
    res.status(201).json({ success: true, data: message });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin handoff post]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.post('/handoff/read', async (req: Request, res: Response) => {
  try {
    const { reader, last_seen_id: lastSeenId } = req.body as {
      reader?: unknown;
      last_seen_id?: unknown;
    };
    if (typeof reader !== 'string' || reader.trim() === '') {
      res.status(400).json({ success: false, error: 'reader is required' });
      return;
    }
    const upTo = Number(lastSeenId);
    if (!Number.isFinite(upTo) || upTo < 0) {
      res.status(400).json({ success: false, error: 'last_seen_id must be a number' });
      return;
    }
    const stored = await markHandoffRead(reader, upTo);
    res.status(200).json({ success: true, data: { last_seen_id: stored } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin handoff read-mark]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.get('/target-list/base-walk', async (_req: Request, res: Response) => {
  try {
    const status = await baseWalkStatus();
    res.status(200).json({ success: true, data: status });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin base-walk]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// What the weekly list said, and when (tasks 1–10).
//   GET /admin/target-list/history?phone=+995...&limit=200
// Without a phone: the most recent builds, newest first. With one: that
// person's whole line through them — "why was he third last month and
// fourteenth now" answered from the record instead of from memory. Read-only.
adminRouter.get('/target-list/history', async (req: Request, res: Response) => {
  try {
    const phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : '';
    const rawLimit = Number(req.query.limit);
    const rows = await readScoreHistory({
      ...(phone === '' ? {} : { phone }),
      ...(Number.isFinite(rawLimit) && rawLimit > 0 ? { limit: rawLimit } : {}),
    });
    res.status(200).json({ success: true, data: { total: rows.length, history: rows } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin target-list history]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// The founder's review of the weekly list, as a spreadsheet (tasks 1–10).
//   GET /admin/target-list/review.csv?days=30
// Every reason the engine had, one row per candidate, and an empty `decision`
// column. He types კი / არა and sends it back — the one judgment no column in
// this schema can make (his own example: his wife is the №1 candidate by every
// machine signal there is).
adminRouter.get('/target-list/review.csv', async (req: Request, res: Response) => {
  try {
    const rawDays = Number(req.query.days);
    const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(rawDays, 365) : 30;
    const entries = await buildTargetList(days);
    const escape = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""')}"`;
    // Task 5: the tier, the pluses and the city ride beside the score, so the
    // founder reads BEST / GOOD / NOT YET and the reasons in his own words.
    const header =
      'phone,name,tier,city,pluses,score,fit,why,reach,bubble_density,subscribed_holders,route,decision,note';
    const csv = [
      header,
      ...entries.map((e) =>
        [
          escape(e.phone),
          escape(e.label),
          e.parts.tier,
          escape(e.city ?? ''),
          escape(e.parts.pluses.map((p) => `${p.code}: ${p.note}`).join(' · ')),
          e.score,
          e.parts.fit,
          escape(e.parts.fit_evidence.join(' · ')),
          e.parts.reach,
          e.parts.bubble === null ? '' : e.parts.bubble.density.toFixed(3),
          e.parts.subscribed_holders,
          e.route,
          '',
          '',
        ].join(','),
      ),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="target_review.csv"');
    res.status(200).send(csv);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin target review csv]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// His answers, loaded back.
//   POST /admin/target-list/decisions
//   body: { decisions: [{ phone, decision: "კი" | "არა" | ..., note? }] }
// „არა" is a REAL exclusion — the engine drops the person the way it drops a
// hotline, and the gate ledger counts it as `founder_said_no`, so the cost of
// his own rulings is as visible as the cost of every other rule. Anything that
// is neither yes nor no leaves the row untouched: a mis-read „maybe" that
// lands as „no" would delete somebody from every future list unnoticed.
//   Undo: POST again with the opposite answer, or
//         DELETE FROM target_decisions WHERE phone = '<phone>';
adminRouter.post('/target-list/decisions', async (req: Request, res: Response) => {
  try {
    const body = req.body as { decisions?: unknown };
    if (!Array.isArray(body.decisions)) {
      res.status(400).json({ success: false, error: 'decisions აუცილებელია' });
      return;
    }
    const actor = String((req as AuthenticatedRequest).user?.userId ?? 'admin');
    const result = await applyTargetDecisions(body.decisions as TargetDecisionInput[], actor);
    // A ruling changes who is on the list, so the cached list is now the old
    // answer — the next read must rebuild.
    clearTargetListCache();
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin target decisions]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Take one answer back: DELETE /admin/target-list/decisions/:phone
// A review loop without an undo is a trap — a mistaken „არა" would otherwise
// need hand-written SQL to recover from.
adminRouter.delete('/target-list/decisions/:phone', async (req: Request, res: Response) => {
  try {
    const phone = String(req.params.phone ?? '').trim();
    if (phone === '') {
      res.status(400).json({ success: false, error: 'ნომერი აუცილებელია' });
      return;
    }
    const removed = await clearTargetDecision(phone);
    clearTargetListCache();
    res.status(200).json({ success: true, data: { phone, removed } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin target decision clear]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Every standing answer — who decided what, and why when they said why.
adminRouter.get('/target-list/decisions', async (_req: Request, res: Response) => {
  try {
    const decisions = await listTargetDecisions();
    res.status(200).json({ success: true, data: { total: decisions.length, decisions } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin target decisions list]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// The research trigger table (THE TARGETS Part 3, Task 3).
//   GET /admin/research-plan?days=30&limit=50
// Reads the labels of the people currently on the target list, decides what
// the engine WOULD look up about each one and where, and reports how many
// people each rule sent where. Nothing is searched and nothing is written:
// this is the decision, not the research.
adminRouter.get('/research-plan', async (req: Request, res: Response) => {
  try {
    const rawDays = Number(req.query.days);
    const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(rawDays, 365) : 30;
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
    const entries = (await buildTargetList(days)).slice(0, limit);
    const signals = await readLabels(entries.map((e) => e.phone));
    const ledger = new TriggerLedger();
    const plans = entries.map((entry) => {
      const forPhone = signals.get(entry.phone);
      if (forPhone === undefined) return null;
      // The NAME, not the label: the label carries the company word glued on,
      // and the first live run searched the register for „Levan Shalamberidze
      // Axel Member".
      const name = forPhone.name_tokens.slice(0, 2).join(' ');
      return {
        label: entry.label,
        ...ledger.record(planResearch(entry.phone, name, forPhone)),
      };
    });
    res.status(200).json({
      success: true,
      data: {
        considered: entries.length,
        triggers: ledger.report(),
        plans: plans.filter((p) => p !== null),
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin research-plan]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// The wake-up list (founder, 5 September): accounts that registered and never
// came back, ranked by how much of their own network is already here.
//   GET /admin/wake-up?limit=100
// Read-only. NOTHING is sent from here — the channel and the words need the
// founder's yes, and this route only answers who and why.
adminRouter.get('/wake-up', async (req: Request, res: Response) => {
  try {
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 100;
    const candidates = await listWakeUpCandidates(limit);
    res.status(200).json({ success: true, data: { total: candidates.length, candidates } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin wake-up]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Show the wake-up wording to named reviewers, inside their own Netai
// accounts, before it reaches anybody it is actually for.
//   POST /admin/wake-up/preview   body: { reviewer_user_ids: ["501", "160584"] }
// Builds the message from the TOP real candidate and their real numbers, and
// delivers it as a thread to each reviewer. Reaches nobody else: the people
// this message is for have never opened Netai, so no thread would find them.
adminRouter.post('/wake-up/preview', async (req: Request, res: Response) => {
  try {
    const body = req.body as { reviewer_user_ids?: unknown; name?: unknown };
    const reviewers = Array.isArray(body.reviewer_user_ids)
      ? body.reviewer_user_ids.map((id) => String(id).trim()).filter((id) => /^\d+$/.test(id))
      : [];
    if (reviewers.length === 0) {
      res.status(400).json({ success: false, error: 'reviewer_user_ids აუცილებელია' });
      return;
    }
    const [top] = await listWakeUpCandidates(1);
    if (top === undefined) {
      res.status(404).json({ success: false, error: 'გასაღვიძებელი კანდიდატი არ არის' });
      return;
    }
    const name = String(body.name ?? '').trim();
    const previews = await previewWakeUpMessage(reviewers, top, name === '' ? 'მეგობარო' : name);
    res.status(200).json({ success: true, data: { sent_to_reviewers: previews.length, previews } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin wake-up preview]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Invite cohorts (Ticket 10 Task 26, D125): a registration code the company
// hands out, carrying its own free period — the Axel launch gets 20 days, the
// ordinary door keeps the Stripe trial. Opening a cohort writes config, not a
// fact about a person; registering through one is the person's own act.
//   GET    /admin/invite-cohorts                  every cohort, with how many it let in
//   POST   /admin/invite-cohorts                  { code, name, trial_days, tier?, note? }
//   DELETE /admin/invite-cohorts/:code            close the door (nobody loses their period)
//   GET    /admin/invite-cohorts/:code/members    who came through it, and what day they are on
adminRouter.get('/invite-cohorts', async (_req: Request, res: Response) => {
  try {
    res.status(200).json({ success: true, data: await listCohorts() });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin invite-cohorts]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.post('/invite-cohorts', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      code?: unknown;
      name?: unknown;
      trial_days?: unknown;
      tier?: unknown;
      note?: unknown;
    };
    if (typeof body.code !== 'string' || typeof body.name !== 'string') {
      res.status(400).json({ success: false, error: 'code და name აუცილებელია' });
      return;
    }
    const actor = String((req as AuthenticatedRequest).user?.userId ?? 'admin');
    const outcome = await createCohort(
      {
        code: body.code,
        name: body.name,
        trial_days: Number(body.trial_days),
        ...(typeof body.tier === 'string' && { tier: body.tier }),
        ...(typeof body.note === 'string' && { note: body.note }),
      },
      actor,
    );
    if (!outcome.created) {
      res.status(400).json({ success: false, error: outcome.error });
      return;
    }
    res.status(201).json({ success: true, data: outcome.cohort });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin invite-cohorts create]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.delete('/invite-cohorts/:code', async (req: Request, res: Response) => {
  try {
    const closed = await deactivateCohort(String(req.params.code));
    if (!closed) {
      res.status(404).json({ success: false, error: 'ასეთი აქტიური კოჰორტა არ არის' });
      return;
    }
    res.status(200).json({ success: true, data: { closed: true } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin invite-cohorts close]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

//   GET /admin/invite-cohorts/:code/members?min_day=20 — the founder's day-20
//   (and day-40) list: who used what, who paid (Task 26; Task 28 done-when).
adminRouter.get('/invite-cohorts/:code/members', async (req: Request, res: Response) => {
  try {
    // Ticket 11 Task 12 (e): „no such cohort" and „no members yet" are two answers.
    if ((await findCohortAnyState(String(req.params.code))) === null) {
      res.status(404).json({ success: false, error: 'ასეთი კოჰორტა არ არის' });
      return;
    }
    const rawMinDay = Number(req.query.min_day);
    const minDay = Number.isFinite(rawMinDay) && rawMinDay > 0 ? Math.floor(rawMinDay) : 0;
    const members = await listCohortMembers(String(req.params.code), minDay);
    res
      .status(200)
      .json({ success: true, data: { total: members.length, min_day: minDay, members } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin invite-cohorts members]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// T8: manual triggers for the same functions chorusCampaign.cron.ts calls on
// its own timer (open every 6h, send every 15min, sweep daily) — an ops
// lever for immediate runs, and how this engine gets verified without
// waiting out the cron cadence.
adminRouter.post('/chorus/open-campaigns', async (req: Request, res: Response) => {
  try {
    const rawDays = Number(req.query.days);
    const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(rawDays, 365) : 30;
    const result = await openDueCampaigns(days);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin chorus open-campaigns]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.post('/chorus/send-asks', async (req: Request, res: Response) => {
  try {
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
    const sent = await sendDueCampaignAsks(limit);
    res.status(200).json({ success: true, data: { sent } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin chorus send-asks]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Ticket 9 task 13.6, run once with the founder's explicit go-ahead
// (4 September) and kept as an ops lever afterwards.
//   POST /admin/chorus/close-stale?days=30&dry_run=true|false
//   body: none. dry_run defaults to TRUE — the list comes back first, and
//   nothing is written until the caller asks for it in as many words.
//   Undo: UPDATE invite_campaigns SET status = 'open', closed_at = NULL,
//         closed_reason = NULL WHERE id = ANY(<the ids in the response>);
//         the participants and their threads are never touched, only the
//         campaign's status and the badge on the threads it had asked.
adminRouter.post('/chorus/close-stale', async (req: Request, res: Response) => {
  try {
    const rawDays = Number(req.query.days);
    const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(rawDays, 365) : 30;
    const dryRun = req.query.dry_run !== 'false';
    const result = await closeStaleCampaigns(days, dryRun);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin chorus close-stale]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Verification lever for ticket 9 task 13.7: open ONE invite campaign between
// our own test accounts so the invite thread's behaviour can be proved without
// asking a real person about a real person.
//   POST /admin/chorus/seed-campaign
//   body: { target_phone, inviter_user_id, label }
//   Refused unless BOTH sides are on the REVIEW_PHONE list.
//   Undo: POST /admin/chorus/close-stale (the target is a test number, so the
//         list never chooses it) or close the campaign row by id.
adminRouter.post(
  '/chorus/seed-campaign',
  body('target_phone').isString().trim().notEmpty(),
  body('inviter_user_id').isInt({ min: 1 }),
  body('label').isString().trim().isLength({ min: 1, max: 80 }),
  async (req: Request, res: Response) => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({ success: false, error: 'target_phone, inviter_user_id, label' });
      return;
    }
    try {
      const input = req.body as { target_phone: string; inviter_user_id: number; label: string };
      const result = await seedTestCampaign(
        input.target_phone,
        Number(input.inviter_user_id),
        input.label,
      );
      res.status(result.opened ? 201 : 409).json({ success: result.opened, data: result });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[admin chorus seed-campaign]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// Ticket 12 Task 59: test chats out of the founder's account — moved, not
// deleted, so one call with the accounts swapped puts them back.
//   POST /admin/threads/move
//   body: { from_user_id, to_user_id, thread_ids?: number[], created_on?: 'YYYY-MM-DD', dry_run?: boolean }
// `dry_run` defaults to TRUE: it lists what would move and moves nothing.
const MAX_THREADS_PER_MOVE = 500;
adminRouter.post('/threads/move', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      from_user_id?: unknown;
      to_user_id?: unknown;
      thread_ids?: unknown;
      created_on?: unknown;
      dry_run?: unknown;
    };
    const from = String(body.from_user_id ?? '').trim();
    const to = String(body.to_user_id ?? '').trim();
    if (!/^\d+$/.test(from) || !/^\d+$/.test(to) || from === to) {
      res.status(400).json({ success: false, error: 'from_user_id და to_user_id აუცილებელია' });
      return;
    }
    const explicit = Array.isArray(body.thread_ids)
      ? body.thread_ids.map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    const day = typeof body.created_on === 'string' ? body.created_on.trim() : '';
    if (explicit.length === 0 && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      res.status(400).json({ success: false, error: 'thread_ids ან created_on აუცილებელია' });
      return;
    }
    const byDay = day ? await threadIdsCreatedOn(from, day) : [];
    const candidates = [...new Set([...explicit, ...byDay.map((t) => t.id)])].slice(
      0,
      MAX_THREADS_PER_MOVE,
    );
    const dryRun = body.dry_run !== false;
    if (dryRun) {
      res.status(200).json({
        success: true,
        data: {
          dry_run: true,
          from,
          to,
          would_move: candidates.length,
          threads: byDay,
          thread_ids: candidates,
        },
      });
      return;
    }
    const out = await moveThreads(from, to, candidates);
    // eslint-disable-next-line no-console
    console.log(
      `[admin threads move] ${out.moved.length} threads, ${out.tasks_moved.length} tasks, ${out.messages_moved} messages: ${from} → ${to} by admin ${(req as AuthenticatedRequest).user.userId}`,
    );
    res.status(200).json({ success: true, data: { dry_run: false, from, to, ...out } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin threads move]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Ticket 12 Task 10: one person on or off a roster, by phone. The Axel roster
// (84 rows) was loaded from the founder's file on 5 September; the founder's
// own numbers were not in that file, so his membership opened no door.
//   POST   /admin/roster/:group/members { phone }   → adds (idempotent)
//   DELETE /admin/roster/:group/members/:phone      → soft-retracts (the undo)
adminRouter.post('/roster/:group/members', async (req: Request, res: Response) => {
  try {
    const body = req.body as { phone?: unknown; former?: unknown };
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (phone === '') {
      res.status(400).json({ success: false, error: 'phone აუცილებელია' });
      return;
    }
    const curator = String((req as AuthenticatedRequest).user.userId);
    const out = await addRosterMember(String(req.params.group), phone, curator, {
      former: body.former === true,
    });
    res.status(out.changed ? 201 : 200).json({ success: true, data: out });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin roster add]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.delete('/roster/:group/members/:phone', async (req: Request, res: Response) => {
  try {
    const out = await removeRosterMember(String(req.params.group), String(req.params.phone));
    if (!out.changed) {
      res.status(404).json({ success: false, error: 'ასეთი წევრი სიაზე არ არის' });
      return;
    }
    res.status(200).json({ success: true, data: out });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin roster remove]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Ticket 13 Task 54: copy the participant rows' when/how/reason into every
// chorus_ask payload that still carries a null (the four asks of 28 August).
adminRouter.post('/chorus/asks/technique-sync', async (_req: Request, res: Response) => {
  try {
    const updated = await syncChorusAskTechniqueTags();
    res.status(200).json({ success: true, data: { updated } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin chorus technique-sync]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.post('/chorus/sweep', async (_req: Request, res: Response) => {
  try {
    const result = await sweepStaleParticipants();
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin chorus sweep]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// Ticket 17 row 6: why a notification did or did not arrive, for one account.
// Built after the frontend showed the question could not be answered from the
// data: an Apple endpoint does not say WHICH device (web.push.apple.com serves
// macOS Safari too), and "sent or failed" existed only in the Railway log.
//   GET /admin/users/:userId/push
adminRouter.get('/users/:userId/push', async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId ?? '');
    if (!/^\d+$/.test(userId)) {
      res.status(400).json({ success: false, error: 'userId უნდა იყოს რიცხვი' });
      return;
    }
    const [subs, deliveries, recording, counts] = await Promise.all([
      query(
        `SELECT CASE
                  WHEN endpoint LIKE '%web.push.apple.com%' THEN 'apple'
                  WHEN endpoint LIKE '%fcm.googleapis%'     THEN 'google'
                  WHEN endpoint LIKE '%mozilla%'            THEN 'mozilla'
                  ELSE 'other' END                         AS provider,
                user_agent,
                device_id,
                -- The last 12, because that is exactly what the diagnostics
                -- card on the person's own profile shows them. A screenshot
                -- from their phone then lines up against a row here without
                -- anybody having to read out a whole UUID.
                RIGHT(device_id, 12)                       AS device_id_tail,
                -- The endpoint itself identifies a device and is not needed to
                -- read the answer; the tail is enough to tell two apart.
                RIGHT(endpoint, 12)                        AS endpoint_tail,
                created_at
         FROM push_subscriptions WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId],
      ),
      query(
        `SELECT status, status_code, error, RIGHT(endpoint, 12) AS endpoint_tail, created_at
         FROM push_deliveries WHERE user_id = $1
         ORDER BY created_at DESC LIMIT 50`,
        [userId],
      ),
      // The date the counts actually start from. Asked for by the frontend so
      // its chip can say „from 12 Sep" instead of „since we started
      // recording" — and the vaguer wording was the thing still leaving room
      // for the wrong reading.
      //
      // Derived, never written down. It was a hardcoded „12 September" here,
      // which was true the day it was written and stops being true the moment
      // the 30-day prune first runs: the sentence would then claim six weeks
      // of history that had just been deleted. Read from the table, it follows
      // the retention window by itself and cannot drift.
      query<{ since: Date | string | null }>(
        `SELECT MIN(created_at) AS since FROM push_deliveries`,
        [],
      ),
      // The counts, over EVERY record this person has — not over the fifty the
      // list above happens to show.
      //
      // Ticket 19 item 24 found this: Lika's block read „from 12 Sept: sent 50
      // · skipped 0 · failed 0" while her real totals were 128, 36 and 0. The
      // counters were computed from `recent_deliveries`, which is capped at
      // fifty, so „50 sent" was really „the fifty newest rows, all of them
      // sends" — and the date beside it promised a range the numbers did not
      // cover. A tidier story than the truth, on the screen built to stop
      // exactly that.
      query<{ status: string; n: string }>(
        `SELECT status, COUNT(*)::text AS n FROM push_deliveries
         WHERE user_id = $1 GROUP BY status`,
        [userId],
      ),
    ]);
    // ISO 8601, not Postgres's own text. Its form — a space where the T belongs
    // and six-digit microseconds — is not something Safari parses, so the same
    // date that reads correctly on a Mac becomes "Invalid Date" on an iPhone.
    // The frontend found that and worked around it on their side; a workaround
    // there is not a fix here, because the next reader hits it again.
    const rawSince = (recording.rows[0] as { since: Date | string | null } | undefined)?.since;
    const recordingSince =
      rawSince === null || rawSince === undefined ? null : new Date(rawSince).toISOString();
    const countOf = (want: string): number =>
      Number(
        (counts.rows as { status: string; n: string }[]).find((r) => r.status === want)?.n ?? 0,
      );
    // Which of this person's devices is watching RIGHT NOW. This is the whole
    // of row 6 on one screen: a device marked live is a device we deliberately
    // did not push to, and without this the skip looks identical to silence.
    const live = connectedDevices(userId);
    const subscriptions = subs.rows.map((row) => {
      const sub = row as { device_id: string | null; user_agent: string | null };
      const key = deviceKey(sub.device_id, sub.user_agent);
      return { ...sub, live: key !== null && live.has(key) };
    });
    res.status(200).json({
      success: true,
      data: {
        subscriptions,
        // The newest fifty, for reading. The counts below are NOT taken from
        // this list — that was the bug in item 24 — so the cap is stated here
        // rather than left for a reader to infer from the length.
        recent_deliveries: deliveries.rows,
        recent_deliveries_limit: 50,
        sent_recently: countOf('sent'),
        // Counted by name, not by subtraction. Since presence became
        // per-device there is a third status — 'skipped', the device was live
        // and we chose not to interrupt it — and "everything that is not sent
        // is failed" turned every one of those into a failure on the one
        // screen whose job is to tell them apart.
        failed_recently: countOf('failed'),
        skipped_recently: countOf('skipped'),
        // What the three counts above are counting FROM. Null means nothing has
        // ever been recorded, which is not the same as nobody ever being sent
        // anything — the counts are then unknown, not zero.
        recording_since: recordingSince,
        // Said out loud, because it is the trap row 6 fell into: every row
        // before this shipped is missing, and an Apple subscription with no
        // user_agent could be a Mac.
        note:
          (recordingSince === null
            ? 'No delivery has ever been recorded, so the counts above are unknown rather ' +
              'than zero. '
            : `Deliveries are recorded only from ${recordingSince.slice(0, 10)}; anything ` +
              'earlier is absent, not failed. ') +
          'A subscription with no user_agent predates that field — an apple provider ' +
          'there may be macOS Safari, not an iPhone. A "skipped" delivery is not a failure: ' +
          'that device had the app open and would have seen the answer anyway. A subscription ' +
          'with no device_id has not re-subscribed since 13 September and still falls back to ' +
          "the old rule (skipped whenever ANY of this person's devices is live).",
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin user push]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.get('/chorus/campaigns', async (req: Request, res: Response) => {
  try {
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 100;
    const [campaigns, dial, sharedCircles] = await Promise.all([
      // Ticket 17 Task 40. Read on 12 September: 50 open campaigns, every one of
      // them "with an empty inviter and an empty reason". The data was never
      // empty — all 50 have participants and 11 have sent an ask. This endpoint
      // simply never returned either field, and `closed_reason` is null on an
      // OPEN campaign by definition, so the reason column could only ever be
      // blank for exactly the rows a reader most wants explained.
      //
      // So both are answered now. `inviters` names the people scheduled to ask,
      // with the state of each (names only — no inviter phone joins an admin
      // list that already shows the target's). `state_reason` says why the row
      // stands where it does, and is filled for an open campaign too.
      query(
        `SELECT c.id, c.target_phone, c.target_label, c.city, c.status, c.ask_count_dial,
                c.opened_at, c.closed_at, c.closed_reason,
                -- ::int, and it is not cosmetic. Postgres COUNT is bigint, and
                -- node-postgres hands a bigint back as a STRING rather than
                -- lose precision on it. So this page was sending "12" and "9",
                -- and in the client "12" > "9" is false — a sort or a
                -- threshold on either column reads backwards, silently, on
                -- exactly the rows that matter most. I warned the frontend
                -- about it and left the server sending the wrong type, which
                -- is the wrong half to fix: a count of campaign participants
                -- has no precision to lose.
                COUNT(p.id)::int AS participant_count,
                COUNT(p.id) FILTER (WHERE p.asked_at IS NOT NULL)::int AS asked_count,
                MIN(p.scheduled_ask_at) FILTER (WHERE p.asked_at IS NULL)
                  AS next_ask_due_at,
                COALESCE(
                  jsonb_agg(
                    jsonb_build_object(
                      'name', COALESCE(NULLIF(TRIM(u.name), ''), 'უსახელო ანგარიში'),
                      -- Row 40's fourth column is a count per INVITER-target
                      -- pair, so the row has to say which inviter it is. The
                      -- id and not the phone: an admin list already shows the
                      -- target's number and does not need a second one.
                      'inviter_user_id', p.inviter_user_id,
                      'state', p.state,
                      'asked_at', p.asked_at,
                      'scheduled_ask_at', p.scheduled_ask_at)
                    ORDER BY p.scheduled_ask_at)
                    FILTER (WHERE p.id IS NOT NULL),
                  '[]'::jsonb)                              AS inviters,
                CASE
                  WHEN c.status <> 'open'            THEN COALESCE(c.closed_reason, c.status)
                  WHEN COUNT(p.id) = 0               THEN 'ღიაა, მომწვევის გარეშე — არავინაა სათხოვნელი'
                  WHEN COUNT(p.id) FILTER (WHERE p.asked_at IS NOT NULL) = 0
                    THEN 'ღიაა, პირველი კითხვა ჯერ არ გასულა — გრაფიკს ელოდება'
                  WHEN COUNT(p.id) FILTER (WHERE p.asked_at IS NULL) > 0
                    THEN 'ღიაა, კითხვა გასულია — შემდეგი მომწვევი გრაფიკზეა'
                  ELSE 'ღიაა, ყველა მომწვევს უკითხეს — პასუხს ელოდება'
                END                                         AS state_reason
         FROM invite_campaigns c
         LEFT JOIN invite_campaign_participants p ON p.campaign_id = c.id
         LEFT JOIN "User" u ON u.id = p.inviter_user_id AND u."deletedAt" IS NULL
         GROUP BY c.id
         ORDER BY c.opened_at DESC
         LIMIT $1`,
        [limit],
      ),
      currentGlobalDial(),
      // Row 40's fourth column, in one query for the whole page rather than
      // one per pair — see sharedCirclesForCampaigns for what the loop would
      // have cost. Started BESIDE the page query, so the page pays the slower
      // of the two and not their sum.
      sharedCirclesForCampaigns(limit),
    ]);
    res.status(200).json({
      success: true,
      data: { campaigns: withSharedCircles(campaigns.rows, sharedCircles), current_dial: dial },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin chorus campaigns]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

/** A technique value printed as what it means: 0 is „none", NULL is „unknown" (migration 097). */
function techniqueWord(value: number | null): string {
  if (value === null) return 'unknown';
  if (value === 0) return 'none';
  return String(value);
}

// The campaign asks themselves, one row per inviter asked, WITH the technique
// tag (Ticket 9 Task 22 — „no technique field on any of 60 /admin/asks rows":
// those rows were member-to-member asks, which carry no technique; this is the
// table that does). Each value comes twice: the stored number and the word it
// means, so a 0 is never again read as a zero count.
//   GET /admin/chorus/asks?limit=100&campaign_id=&inviter_user_id=
/**
 * WHY THIS PERSON — row 40's missing column, and the reason was being computed
 * and then thrown away.
 *
 * The row asks each line to show WHO, WHY THEM, WHO INVITES and WHAT YOU HAVE
 * IN COMMON. Two of the four were nowhere, and my own note proposed filling
 * „why them" from `target_label` and `city`. Reading the selection code killed
 * that idea: those two describe the CAMPAIGN, so every participant of one
 * campaign carries the same string. It answers „what is this campaign looking
 * for", not „why this person", and printing it under the second heading would
 * be the substitution this codebase keeps finding in its own reporting.
 *
 * The real reason is in `scheduleParticipants`: candidates are ordered by
 * `contact_relationship_scores.strength_score DESC NULLS LAST` and the top
 * `dial` are taken. That score IS the answer, and the INSERT stores only
 * (campaign_id, inviter_user_id, state, scheduled_ask_at) — the number that
 * decided it is discarded. The score table persists, so it is recovered here
 * at read time instead.
 *
 * AND THE RECOVERY IS PARTIAL, WHICH IS ITSELF THE FINDING. Of the 85 pending
 * participants, 35 have a score (0.4 to 0.95) and FIFTY HAVE NONE — `NULLS
 * LAST` means a candidate with no measured tie is still eligible and gets
 * taken when there are not enough scored ones. „Strong tie, 0.95" and „no
 * measured tie at all" are the two things a founder deciding whom to approve
 * most needs to tell apart, and until now the screen showed him neither.
 *
 * WHAT YOU HAVE IN COMMON is answered narrowly and the narrowness is stated in
 * the payload, because the obvious reading cannot be answered at all: the
 * target is not a member, so we hold no contact list for them and there is no
 * set to intersect. What IS knowable is how many people in the network already
 * have this target in their contacts, and that is what `known_by` counts.
 *
 * COST, MEASURED BEFORE PROMISING (my own note said to). Written with
 * `regexp_replace` on both sides it timed out at fifteen seconds; written as
 * plain equality it is 1.9 s for a hundred rows. That is not a shortcut — both
 * columns are `+`-prefixed with no separators on 100% of rows (1,927,483 of
 * 1,927,483 scores, 120 of 120 campaigns), so the regexp was a no-op that only
 * destroyed the index. Both indexes this needs already exist, so nothing is
 * added to the database for it.
 *
 * NO PHONE LEAVES THIS ROUTE (D149). `target_phone` is joined on and never
 * selected.
 */
export function whyThisPerson(tieStrength: number | null): string {
  if (tieStrength === null) {
    return 'No measured tie to the target — taken because the dial had room, not because this person is known to be close.';
  }
  return `Measured tie to the target: ${tieStrength}. Candidates are ordered strongest first.`;
}

adminRouter.get('/chorus/asks', async (req: Request, res: Response) => {
  try {
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 100;
    const campaignId = Number.isFinite(Number(req.query.campaign_id))
      ? Number(req.query.campaign_id)
      : null;
    const inviterId = Number.isFinite(Number(req.query.inviter_user_id))
      ? Number(req.query.inviter_user_id)
      : null;
    const result = await query<{
      total_count: number;
      technique_when: number | null;
      technique_how: number | null;
      technique_reason: number | null;
      tie_strength: number | null;
      known_by: number;
    }>(
      // The same total-with-the-page shape `/admin/asks` and `/admin/goals`
      // carry: this route was a bare array capped at the limit, which is the
      // fault its sibling was mended for this morning.
      `SELECT (COUNT(*) OVER ())::int AS total_count,
              p.id, p.campaign_id, c.target_label, c.city, c.status AS campaign_status,
              p.inviter_user_id, u.name AS inviter_name, p.state, p.scheduled_ask_at,
              p.asked_at, p.thread_id, p.state_updated_at,
              p.technique_when, p.technique_how, p.technique_reason,
              crs.strength_score AS tie_strength,
              COALESCE(k.known_by, 0)::int AS known_by
       FROM invite_campaign_participants p
       JOIN invite_campaigns c ON c.id = p.campaign_id
       LEFT JOIN "User" u ON u.id = p.inviter_user_id
       LEFT JOIN contact_relationship_scores crs
              ON crs.user_id = p.inviter_user_id AND crs.contact_phone = c.target_phone
       LEFT JOIN LATERAL (
         SELECT COUNT(DISTINCT s.user_id) AS known_by
           FROM contact_relationship_scores s
          WHERE s.contact_phone = c.target_phone
       ) k ON true
       WHERE ($1::int IS NULL OR p.campaign_id = $1::int)
         AND ($2::int IS NULL OR p.inviter_user_id = $2::int)
       ORDER BY p.id DESC
       LIMIT $3::int`,
      [campaignId, inviterId, limit],
    );
    // COMPOSED WITH `askPageFrom`, NOT A SECOND COPY OF IT. That function is
    // where `truncated` is decided and tested, and the whole reason this route
    // is being touched is that its sibling published a page size as a total.
    // Writing the same three lines again here is how the two drift apart.
    // Enriching afterwards is safe: a map changes no length.
    const page = askPageFrom(result.rows);
    const asks = page.asks.map((r) => ({
      ...r,
      why_them: whyThisPerson(r.tie_strength),
      technique: {
        when: techniqueWord(r.technique_when),
        how: techniqueWord(r.technique_how),
        reason: techniqueWord(r.technique_reason),
      },
    }));
    res.status(200).json({
      success: true,
      data: { asks, total: page.total, truncated: page.truncated },
      note:
        'why_them is recovered at read time from contact_relationship_scores — the score that ' +
        'chose this inviter is not stored on the row. A null tie_strength is not missing data: ' +
        'the candidate had no measured tie and was taken anyway (NULLS LAST). known_by counts ' +
        'people in the network who already have this target in their contacts; it is NOT shared ' +
        'contacts between inviter and target, which cannot be computed — the target is not a ' +
        'member and we hold no contact list for them.',
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin chorus asks]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// T16: manual trigger for the same generator labReport.cron.ts calls weekly,
// plus a listing of stored snapshots — every number in the report is
// drillable back to the raw rows it summarizes via the underlying tables
// (invite_campaigns, contact_facts, etc.), not just this endpoint.
adminRouter.post('/lab-report/generate', async (req: Request, res: Response) => {
  try {
    const weekStart =
      typeof req.query.week_start === 'string' ? req.query.week_start : currentWeekStartISO();
    const report = await generateAndStoreWeeklyReport(weekStart);
    res.status(200).json({ success: true, data: report });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin lab-report generate]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.get(
  '/lab-report',
  async (req: Request, res: Response<ApiResponse<StoredLabReport[]>>) => {
    try {
      const rawLimit = Number(req.query.limit);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 52) : 12;
      const reports = await getStoredLabReports(limit);
      res.status(200).json({ success: true, data: reports });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[admin lab-report list]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// ─── Ticket 7 Task 2 item 2: the 1,032 sync-borne contact links ────────────
// Preview-then-execute, per D44 (every data-changing admin operation runs
// with the founder's yes, with its shape documented):
//   GET  /admin/contacts/foreign-sync-preview?contaminated_user_id&sync_source_user_id
//        — pure read: { count, distinct_phones, links[] }. Show this first.
//   POST /admin/contacts/remove-foreign-sync
//        body { contaminated_user_id, sync_source_user_id, confirmed: true }
//        — deletes the byte-identical UserAlias rows; contacts left with no
//        alias also lose the user's tags, derived views and his own graph
//        edge (D23: cut the link, keep the person — every other user's rows
//        survive, so the people stay reachable as second degree).
//        Undo: none in place — restore is a fresh device import only.
//        Read-back: the preview returns count 0 after a completed removal.
adminRouter.get('/contacts/foreign-sync-preview', async (req: Request, res: Response) => {
  const contaminated = Number(req.query.contaminated_user_id);
  const source = Number(req.query.sync_source_user_id);
  if (
    !Number.isInteger(contaminated) ||
    contaminated <= 0 ||
    !Number.isInteger(source) ||
    source <= 0
  ) {
    res.status(400).json({
      success: false,
      error: 'contaminated_user_id და sync_source_user_id აუცილებელია',
    });
    return;
  }
  try {
    const preview = await previewForeignSyncLinks(String(contaminated), String(source));
    res.status(200).json({ success: true, data: preview });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin foreign-sync preview]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.post(
  '/contacts/remove-foreign-sync',
  body('contaminated_user_id').isInt({ min: 1 }),
  body('sync_source_user_id').isInt({ min: 1 }),
  body('confirmed')
    .custom((v) => v === true)
    .withMessage('confirmed=true is required — preview first'),
  async (req: Request, res: Response) => {
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
      const result = await removeForeignSyncLinks(
        String(contaminated_user_id),
        String(sync_source_user_id),
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[admin foreign-sync remove]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// ─── Ticket 7 Task 7: the two test contacts written into 501 (D47) ─────────
// D44 documentation:
//   POST /admin/contacts/remove-one
//   Body: { user_id: number, phone: string, confirmed: true }
//   Effect: exactly removeContactFromNetwork's user-initiated semantics
//     (D23: the account's own UserAlias/UserTags rows, derived views, own
//     graph edge — the person survives everywhere else), admin-invoked, plus
//     the contact's rows in the account's label_parse_queue so
//     get_unresolved_labels stops listing it.
//   Undo: none in place — restore is a fresh device import only.
//   Read-back: GET /admin/users/:id network counts drop; the label queue no
//     longer returns the removed phone's rows.
// Approved use (founder, via ticket 7 task 7): +995512121212 and
// +995555123456 out of account 501 — contacts he says he never added.
adminRouter.post(
  '/contacts/remove-one',
  body('user_id').isInt({ min: 1 }),
  body('phone').isString().notEmpty(),
  body('confirmed')
    .custom((v) => v === true)
    .withMessage('confirmed=true is required'),
  async (req: Request, res: Response) => {
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
      const { user_id, phone } = req.body as { user_id: number; phone: string };
      const outcome = await removeContactFromNetwork(String(user_id), phone);
      const queueRows = await query(
        `DELETE FROM label_parse_queue WHERE contact_id = $1 AND phone = $2`,
        [user_id, phone.trim()],
        10_000,
      );
      res.status(200).json({
        success: true,
        data: { ...outcome, label_queue_rows_removed: queueRows.rowCount ?? 0 },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[admin contact remove-one]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// ─── D35 shadow phase (approved 29 Aug): the identity map, admin-only ──────
// D44 documentation:
//   POST /admin/identity/scan { from_owner?: number }
//     Effect: auto-merges registered accounts' own numbers (definitionally
//     one person) into person_identities and walks ONE owner-range of the
//     name-match candidate scan into identity_candidates. Writes only the
//     mapping/queue tables — raw data untouched; no read path consumes the
//     map yet. Re-run with the returned next_from until done.
//   GET  /admin/identity/candidates?status=pending&limit=50 — the review queue.
//   POST /admin/identity/candidates/:id/approve | /reject — the human call;
//     approve extends an existing person when one of the phones is mapped.
//   POST /admin/identity/unmerge { person_id } — exact restore, logged.
// Stamp the name's network-wide reach onto candidates queued before it was
// recorded — the number that tells a reviewer whether "82 owners agree" means
// anything. Paced; call until remaining is 0.
adminRouter.post('/identity/candidates/name-reach', async (req: Request, res: Response) => {
  try {
    const rawLimit = Number((req.body as { limit?: unknown })?.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 1000) : 200;
    const result = await backfillCandidateNameReach(limit);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin identity name-reach]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.post('/identity/scan', async (req: Request, res: Response) => {
  try {
    const rawFrom = Number((req.body as Record<string, unknown>)?.from_owner);
    const fromOwner = Number.isInteger(rawFrom) && rawFrom > 0 ? rawFrom : 1;
    const result = await runIdentityScan(fromOwner);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin identity scan]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// The shadow map's merged TOTALS in one read (ticket 8 task 13.3 — eleven
// guessed spellings 404'd; this is the route).
// One call carries at most this many of the founder's answers — a spreadsheet
// paste is a few hundred rows, and each one is a real merge.
const MAX_IDENTITY_DECISIONS = 500;

// Ticket 9 task 19.3: strip phone numbers from what is ALREADY stored in
// private context, across every account. The writer's guard only protects new
// writes, and there was no way to edit a stored value — only to delete the
// whole key, which is not an option for a line the founder asked to keep.
//   POST /admin/privacy/scrub-private-context?dry_run=true|false
//   Undo: none — a removed phone number cannot be un-removed, which is the
//   point. Run the dry run first; it names the lines it would touch.
// Ticket 9 task 18: take one fact out of the public record.
//   POST /admin/facts/:id/unpublish   body: { reason }
// It does NOT delete the row — the fact stays, retracted, with its reason, so
// the audit trail survives. Used for the „ქოუჩი" row the sweep published under
// the curator's id before that bypass was closed.
//   Undo: UPDATE contact_facts SET retracted_at = NULL, is_public = <prior>
//         WHERE id = <id>;  (the response carries the prior value)
// Ticket 20 — take one fact out of everybody ELSE's reach and leave it on the
// owner's own copy.
//   POST /admin/facts/:id/keep-private   body: { reason }
//   Undo: UPDATE contact_facts SET is_public = <prior>, is_matchable = <prior>
//         WHERE id = <id>;  (the response carries both prior values)
//
// WHY THIS EXISTS BESIDE /unpublish, which looks like it already does the job.
// /unpublish sets retracted_at, and every read filters on that — including
// getVisibleFacts's own-rows query, which is how the OWNER's assistant sees
// their own facts. Retracting therefore takes the fact away from them too.
//
// Tornike's ruling of 17 September is narrower than that, and the narrower part
// is his own addition, unprompted: a fact the assistant read on a web page
// „never goes public" AND „save it as info for Netai brain, so that it knows
// it." Not public, not matchable across the network, still there and still
// usable by the owner's own assistant for the owner's own searches.
//
// `is_matchable` is the half that is easy to miss: it is what lets ANOTHER
// person's search hit the row (searchByInsight and wordMatch both filter
// submitted_by_user_id <> the searcher), so leaving it true would be
// publication by a quieter name.
adminRouter.post('/facts/:id/keep-private', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ success: false, error: 'fact id აუცილებელია' });
      return;
    }
    const reason = String((req.body as { reason?: unknown })?.reason ?? '').trim();
    if (!reason) {
      res.status(400).json({ success: false, error: 'reason აუცილებელია — ეს აუდიტის ჩანაწერია' });
      return;
    }
    const before = await query<{
      id: number;
      field_type: string;
      is_public: boolean;
      is_matchable: boolean;
      source: string | null;
      confidence: string | null;
      submitted_by_user_id: string;
    }>(
      `SELECT id, field_type, is_public, is_matchable, source, confidence, submitted_by_user_id
       FROM contact_facts WHERE id = $1 LIMIT 1`,
      [id],
    );
    const row = before.rows[0];
    if (!row) {
      res.status(404).json({ success: false, error: 'ასეთი ფაქტი არ არსებობს' });
      return;
    }
    // retracted_at is deliberately NOT set: the fact stays readable by its own
    // owner. canonical_value goes because it only has meaning for a published
    // value — it is the crowd's agreed wording, and there is no crowd now.
    await query(
      `UPDATE contact_facts
       SET is_public = false, is_matchable = false, canonical_value = NULL, updated_at = NOW()
       WHERE id = $1`,
      [id],
    );
    // eslint-disable-next-line no-console
    console.log(
      `[admin] fact ${id} kept private by ${(req as AuthenticatedRequest).user?.userId}: ${reason}`,
    );
    res.status(200).json({ success: true, data: { kept_private: row, reason } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin fact keep-private]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.post('/facts/:id/unpublish', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ success: false, error: 'fact id აუცილებელია' });
      return;
    }
    const reason = String((req.body as { reason?: unknown })?.reason ?? '').trim();
    if (!reason) {
      res.status(400).json({ success: false, error: 'reason აუცილებელია — ეს აუდიტის ჩანაწერია' });
      return;
    }
    const before = await query<{
      id: number;
      neo4j_contact_id: string;
      field_type: string;
      value: string;
      is_public: boolean;
      source: string | null;
      submitted_by_user_id: string;
    }>(
      `SELECT id, neo4j_contact_id, field_type, value, is_public, source, submitted_by_user_id
       FROM contact_facts WHERE id = $1 LIMIT 1`,
      [id],
    );
    const row = before.rows[0];
    if (!row) {
      res.status(404).json({ success: false, error: 'ასეთი ფაქტი არ არსებობს' });
      return;
    }
    await query(
      `UPDATE contact_facts
       SET is_public = false, retracted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND retracted_at IS NULL`,
      [id],
    );
    // eslint-disable-next-line no-console
    console.log(
      `[admin] fact ${id} unpublished by ${(req as AuthenticatedRequest).user?.userId}: ${reason}`,
    );
    res.status(200).json({ success: true, data: { unpublished: row, reason } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin fact unpublish]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.post('/privacy/scrub-private-context', async (req: Request, res: Response) => {
  try {
    const dryRun = req.query.dry_run !== 'false';
    res.status(200).json({ success: true, data: await scrubStoredPhoneNumbers(dryRun) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin scrub private context]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.get('/identity/summary', async (_req: Request, res: Response) => {
  try {
    res.status(200).json({ success: true, data: await getIdentitySummary() });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin identity summary]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

/** The largest identity page one read may return; the export carries the rest. */
const IDENTITY_PAGE_MAX = 500;

// The review queue, in the order the founder reviews it (ticket 9 task 29):
//   GET /admin/identity/candidates
//       ?status=pending &limit=200 &offset=0
//       &sort=rarity|confidence   — rarity = rarest names first (D97)
//       &band=rare|uncommon|common
//       &names_only=true          — leave out „Voice Recorder", „Test Referral"…
// Each row now carries sample_alias, co_owners, name_distinct_phones, band and
// looks_like_a_name at the top level: the screen showed „— → — 80%" on 2,316
// rows because all of that was buried inside `evidence`.
adminRouter.get('/identity/candidates', async (req: Request, res: Response) => {
  try {
    const status = ['pending', 'approved', 'rejected'].includes(String(req.query.status))
      ? String(req.query.status)
      : 'pending';
    const rawLimit = Number(req.query.limit);
    // One page is capped (Ticket 9 Task 29: „the file stopped at 200"); the
    // queue itself is not — `offset` pages it and /identity/export is all of it.
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, IDENTITY_PAGE_MAX) : 50;
    const rawOffset = Number(req.query.offset);
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
    const band = ['rare', 'uncommon', 'common'].includes(String(req.query.band))
      ? (String(req.query.band) as RarityBand)
      : undefined;
    const sort = String(req.query.sort) === 'rarity' ? 'rarity' : 'confidence';
    res.status(200).json({
      success: true,
      data: await listIdentityCandidates(status, limit, {
        offset,
        sort,
        ...(band ? { band } : {}),
        // Ticket 14 Task 87: the queue shows people by default; names_only=false
        // is the explicit way to see the filtered rows.
        namesOnly: String(req.query.names_only) !== 'false',
      }),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin identity candidates]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// How much is waiting, in which band, and how much of it is not even a name.
adminRouter.get('/identity/totals', async (_req: Request, res: Response) => {
  try {
    res.status(200).json({ success: true, data: await getIdentityTotals() });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin identity totals]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// The whole queue as a spreadsheet, rarest first, with an empty Decision
// column — the founder reviews from a file (D97) and the file stopped at 200.
//   GET /admin/identity/export?format=csv|json&names_only=true|false
adminRouter.get('/identity/export', async (req: Request, res: Response) => {
  try {
    const namesOnly = String(req.query.names_only) !== 'false';
    const out = await exportIdentityCandidates(namesOnly);
    if (String(req.query.format) === 'json') {
      res.status(200).json({ success: true, data: out });
      return;
    }
    // Ticket 12 Task 22: the columns of NETAI_IDENTITY_CANDIDATES_REVIEW_2026-09-02.xlsx,
    // so the founder's or Lika's answers load back by candidate id (D97, D149:
    // last four digits only).
    const header =
      '#,candidate_id,name_as_saved,how_many_saved_both,how_many_numbers_carry_the_name,band,last_4_of_A,last_4_of_B,looks_like,YOUR_DECISION,note';
    const escape = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      header,
      ...out.rows.map((r, i) =>
        [
          i + 1,
          r.id,
          escape(r.name_as_saved),
          r.people_who_saved_both ?? '',
          r.numbers_with_this_name ?? '',
          r.band,
          escape(r.number_1),
          escape(r.number_2),
          escape(r.looks_like ?? ''),
          '',
          '',
        ].join(','),
      ),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="identity_candidates.csv"');
    res.status(200).send(csv);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin identity export]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

// His answers, loaded back: POST /admin/identity/decisions
//   body: { decisions: [{ id, decision: "yes" | "no" | anything else }] }
// „yes" merges the pair, „no" rejects it, anything else stays PENDING — an
// unsure pair is not a decision and must not become one. Undo per pair:
// POST /admin/identity/candidates/:id/unmerge — which, when this comment first
// said „(existing)", did not exist. Row 236 is that sentence: the page pressed
// the undo the comment promised and got „person_id required" with nowhere to
// type one. It exists now, below.
adminRouter.post('/identity/decisions', async (req: Request, res: Response) => {
  try {
    const body = req.body as { decisions?: { id?: unknown; decision?: unknown }[] };
    const decisions = Array.isArray(body.decisions) ? body.decisions : [];
    if (decisions.length === 0) {
      res.status(400).json({ success: false, error: 'decisions: [{id, decision}]' });
      return;
    }
    if (decisions.length > MAX_IDENTITY_DECISIONS) {
      res
        .status(400)
        .json({ success: false, error: `at most ${MAX_IDENTITY_DECISIONS} decisions per call` });
      return;
    }
    const actor = `admin:${(req as AuthenticatedRequest).user?.userId ?? 'unknown'}`;
    const parsed = decisions
      .map((d) => ({ id: Number(d.id), decision: String(d.decision ?? '') }))
      .filter((d) => Number.isInteger(d.id) && d.id > 0);
    res.status(200).json({ success: true, data: await applyIdentityDecisions(parsed, actor) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin identity decisions]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.post('/identity/candidates/:id/approve', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ success: false, error: 'candidate id აუცილებელია' });
      return;
    }
    const actor = `admin:${(req as AuthenticatedRequest).user?.userId ?? 'unknown'}`;
    const outcome = await approveIdentityCandidate(id, actor);
    res.status(outcome.ok ? 200 : 404).json({ success: outcome.ok, data: outcome });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin identity approve]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.post('/identity/candidates/:id/reject', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ success: false, error: 'candidate id აუცილებელია' });
      return;
    }
    const actor = `admin:${(req as AuthenticatedRequest).user?.userId ?? 'unknown'}`;
    const outcome = await rejectIdentityCandidate(id, actor);
    res.status(outcome.ok ? 200 : 404).json({ success: outcome.ok, data: outcome });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin identity reject]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

/**
 * ROW 236 — UNDO THE DECISION ON ONE CANDIDATE, WHICHEVER DECISION IT WAS.
 *
 * The Identity tab has a candidate id and nothing else; asking it for a person
 * id was asking for something it never saw. For an APPROVAL this removes only
 * the phones that approval inserted and puts the pair back in the queue.
 *
 * ⚠️ 25 SEPTEMBER — AND FOR A REJECTION IT DID NOTHING AT ALL. The founder
 * pressed „უარყოფა" on candidate #232, the bar offered „უკან წაღება", and
 * pressing it answered „No approved candidate with that id." One undo button,
 * two decisions, and only one of them had a server behind it. The page is not
 * asked to pick a route: which decision is being taken back is a fact the
 * server holds, and `undoCandidateDecision` reads it.
 *
 * It is NOT the same as `/identity/unmerge`, which takes a whole person apart.
 * That one is right when the approval created the person and wrong when it
 * extended one — see `unmergeCandidate`.
 *
 * THE STATUS CODE COMES FROM A WORD, NOT FROM THE SENTENCE. It used to be
 * `outcome.error?.startsWith('No approved candidate')` — a route reading prose,
 * which turns into a wrong status the day somebody improves the wording and
 * says nothing while it does.
 *
 * 409 when the approval predates the record of what it merged: the request is
 * well formed and the server cannot be exact, which is a different fact from
 * „you sent the wrong thing", and the body names the route to use instead.
 */
const UNMERGE_STATUS: Record<string, number> = {
  not_found: 404,
  nothing_to_undo: 409,
  cannot_be_exact: 409,
};

adminRouter.post('/identity/candidates/:id/unmerge', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ success: false, error: 'candidate id აუცილებელია' });
      return;
    }
    const actor = `admin:${(req as AuthenticatedRequest).user?.userId ?? 'unknown'}`;
    const outcome = await undoCandidateDecision(id, actor);
    if (outcome.ok) {
      res.status(200).json({ success: true, data: outcome });
      return;
    }
    res
      .status(UNMERGE_STATUS[outcome.reason ?? ''] ?? 409)
      .json({ success: false, error: outcome.error });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin identity candidate unmerge]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

adminRouter.post('/identity/unmerge', async (req: Request, res: Response) => {
  try {
    const personId = String((req.body as Record<string, unknown>)?.person_id ?? '').trim();
    if (!personId) {
      res.status(400).json({ success: false, error: 'person_id აუცილებელია' });
      return;
    }
    const actor = `admin:${(req as AuthenticatedRequest).user?.userId ?? 'unknown'}`;
    // Taking a WHOLE person apart is a real thing to want and a terrible
    // default for a button labelled „undo". Six people were built from more
    // than one approval, and for those this removes phones no single decision
    // added — so it now says no unless the caller means it.
    const wholePerson = (req.body as Record<string, unknown>)?.whole_person === true;
    const outcome = await unmergePerson(personId, actor, wholePerson);
    if (outcome.ok) {
      res.status(200).json({ success: true, data: outcome });
      return;
    }
    // „No such person" is 404. „I can do this but you probably did not mean
    // it" is 409 — a well-formed request the server declines, which is a
    // different fact and the body says which route to use instead.
    const notFound = outcome.error?.startsWith('No such person_id') === true;
    res.status(notFound ? 404 : 409).json({ success: false, error: outcome.error });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin identity unmerge]', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

export default adminRouter;
