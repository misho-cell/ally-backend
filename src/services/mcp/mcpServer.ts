import { NETAI_STILL_IMAGE_URL } from './netaiFigure';
import { connectorInputShape } from './appToolShape';
import { isSharedToolsEnabled, runSharedTool, sharedAppTools } from './sharedTools';
import { appToolsForConnector, runAppToolForConnector } from '../chat.service';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ANSWER_MEMBER_QUESTION_ON, mcpAnswerMemberQuestion } from './answerMemberQuestion';
import { recordFixedUsage } from '../costLedger.service';
import { logToolCall } from '../toolCallLog.service';
import { SEARCH_OUTCOMES } from '../searchOutcome.service';
import {
  mcpBlockContact,
  mcpCheckInbox,
  mcpSnoozeUpdate,
  mcpGetContactFacts,
  mcpGetContactProfile,
  mcpGetGroupConnectors,
  mcpGetCuriosityQueue,
  mcpGetUpcomingBirthdays,
  mcpGetCountryChannels,
  mcpGetNetaiInfo,
  mcpStopContactingMe,
  mcpAllowContactingMe,
  mcpGetNetworkStats,
  mcpGetTopConnectors,
  mcpListBlocked,
  mcpRequestIntroduction,
  mcpRespondToRequest,
  mcpInviteContact,
  mcpGetInviteLink,
  mcpGetUnresolvedLabels,
  mcpGetIntroStatus,
  mcpRemoveContactFromNetwork,
  mcpSaveContactFact,
  mcpSearchByInsight,
  mcpSearchContacts,
  mcpSearchSecondDegree,
  mcpUnblockContact,
  mcpCreateTask,
  mcpGetMyTasks,
  mcpUpdateTask,
  mcpSaveGoalFeedback,
  mcpGrantTaskPermission,
  mcpProposeTaskPlan,
  mcpApproveTaskPlan,
  mcpListAnswerRules,
  mcpDeleteAnswerRule,
  mcpSearchRoster,
  mcpFindWarmPath,
  mcpAskContact,
  mcpSetTaskBrief,
  mcpSetTaskWake,
  mcpFinishTask,
  mcpExcludeContact,
  mcpMarkContactDeceased,
  mcpRemoveExclusion,
  mcpRetractFact,
  mcpForgetFact,
  mcpSaveUserNote,
  mcpForgetUserNote,
  mcpGetUserNotes,
  mcpQueueResult,
  mcpRecordSearchOutcome,
  mcpRecordDebriefOutcome,
  mcpAnswerGoalQuestion,
  mcpCorrectContactFact,
  mcpSaveCloseContact,
  mcpSaveContactRelationship,
  mcpForgetContactRelationship,
  mcpGetContactRelationships,
  mcpRespondToThanksLoopOffer,
  mcpGetPendingUpdates,
  mcpGetProfileQuestion,
  mcpAnswerProfileQuestion,
  McpToolPayload,
} from './handlers';
import {
  MCP_SERVER_INSTRUCTIONS,
  MCP_SERVER_NAME,
  MCP_SERVER_TITLE,
  connectorDescription,
  connectorTitle,
  MCP_SERVER_VERSION,
  PARAM_TEXTS,
  PROMPT_TEXTS,
  TOOL_TEXTS,
} from './texts';

const MCP_USAGE_KIND = 'mcp_tool';
const MCP_USAGE_PROVIDER = 'ally';
const MCP_USAGE_PRICE_KEY = 'mcp.tool_call';

const GENERIC_TOOL_ERROR =
  "Tool failed on the server side. Tell the user something went wrong on Netai's end; " +
  'do not invent results.';

interface McpTextResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
}

/**
 * Runs one tool call: records it in the cost ledger and in `tool_call_log`
 * (both fire-and-forget — neither may break the tool), executes the handler,
 * and converts the payload to MCP text content. Raw errors never reach the
 * client.
 *
 * THE LOG WRITE IS NEW, 22 September, from the tester's observation: this
 * function wrote the ledger and not the log, so every call made through the
 * connector was invisible in the one table that says what a tool actually
 * DID. It could not be written — `tool_call_log.thread_id` was NOT NULL and a
 * connector call has no conversation to belong to. Migration 166 makes the
 * column nullable and adds `surface`.
 *
 * WHAT IT COST: for three days I took counts out of that table and called them
 * „every call". They were every CHAT call. `surface` is what lets an old
 * number and a new one be asked for in the same query, because the totals
 * either side of today are otherwise not comparable.
 */
async function runTool(
  userId: string,
  toolName: string,
  /**
   * What the client asked for. Passed at every call site rather than left out,
   * because a column that promises the arguments and is blank on half the rows
   * is worse than one that is absent: the next person reading the table cannot
   * tell „nothing was passed" from „we did not bother to write it down".
   * `logToolCall` summarises and redacts it (D149: a phone as its last four
   * digits, never in full) exactly as it does the chat's.
   */
  args: Record<string, unknown>,
  run: () => Promise<McpToolPayload>,
): Promise<McpTextResult> {
  recordFixedUsage({
    userId,
    kind: MCP_USAGE_KIND,
    provider: MCP_USAGE_PROVIDER,
    priceKey: MCP_USAGE_PRICE_KEY,
    label: toolName,
  }).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[mcp] ledger write failed for ${toolName}:`, err);
  });

  const startedAt = Date.now();
  /**
   * Written whichever way the call ends, and a throw is recorded as the
   * failure it is. A log that holds only the calls that worked answers „how
   * often does this fail" with silence, which is the substitution this
   * codebase keeps having to undo.
   *
   * No thread and no run: a connector call belongs to neither.
   */
  const record = (result: unknown): void => {
    void logToolCall({
      threadId: null,
      surface: 'connector',
      runId: null,
      userId,
      tool: toolName,
      input: args,
      result,
      durationMs: Date.now() - startedAt,
    });
  };

  try {
    const payload = await run();
    record(payload);
    return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[mcp] ${toolName} failed:`, err);
    record({ error: (err as Error).message });
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: GENERIC_TOOL_ERROR }) }],
      isError: true,
    };
  }
}

/** The connector's own tools, by their texts: the ones the app's are not offered in place of. */
const CONNECTOR_OWN_TOOLS: ReadonlySet<string> = new Set(Object.keys(TOOL_TEXTS));
/** A shared tool may write; the app's own checks decide what it may do. */
const SHARED_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
};

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

function registerSearchTools(server: McpServer, userId: string): void {
  server.registerTool(
    'search_contacts',
    {
      title: connectorTitle('search_contacts'),
      description: connectorDescription('search_contacts'),
      inputSchema: {
        tag: z.string().optional().describe(PARAM_TEXTS.tag),
        name: z.string().optional().describe(PARAM_TEXTS.name),
      },
      annotations: READ_ONLY,
    },
    (args) => runTool(userId, 'search_contacts', args, () => mcpSearchContacts(userId, args)),
  );
  server.registerTool(
    'search_by_insight',
    {
      title: connectorTitle('search_by_insight'),
      description: connectorDescription('search_by_insight'),
      inputSchema: { query: z.string().describe(PARAM_TEXTS.insightQuery) },
      annotations: READ_ONLY,
    },
    (args) => runTool(userId, 'search_by_insight', args, () => mcpSearchByInsight(userId, args)),
  );
  server.registerTool(
    'search_second_degree',
    {
      title: connectorTitle('search_second_degree'),
      description: connectorDescription('search_second_degree'),
      inputSchema: { query: z.string().describe(PARAM_TEXTS.secondDegreeQuery) },
      annotations: READ_ONLY,
    },
    (args) =>
      runTool(userId, 'search_second_degree', args, () => mcpSearchSecondDegree(userId, args)),
  );
}

function registerProfileTools(server: McpServer, userId: string): void {
  server.registerTool(
    'get_network_stats',
    {
      title: connectorTitle('get_network_stats'),
      description: connectorDescription('get_network_stats'),
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () => runTool(userId, 'get_network_stats', {}, () => mcpGetNetworkStats(userId)),
  );
  server.registerTool(
    'get_contact_profile',
    {
      title: connectorTitle('get_contact_profile'),
      description: connectorDescription('get_contact_profile'),
      inputSchema: { contact_ref: z.string().describe(PARAM_TEXTS.contactRef) },
      annotations: READ_ONLY,
    },
    (args) =>
      runTool(userId, 'get_contact_profile', args, () => mcpGetContactProfile(userId, args)),
  );
}

function registerIntroTools(server: McpServer, userId: string): void {
  server.registerTool(
    'request_introduction',
    {
      title: connectorTitle('request_introduction'),
      description: connectorDescription('request_introduction'),
      inputSchema: {
        mediator_name: z.string().describe(PARAM_TEXTS.mediatorName),
        mediator_ref: z.string().optional().describe(PARAM_TEXTS.mediatorRef),
        target_name: z.string().describe(PARAM_TEXTS.targetName),
        message: z.string().describe(PARAM_TEXTS.introMessage),
        ask_type: z.enum(['intro', 'share_contact']).optional().describe(PARAM_TEXTS.askType),
      },
      annotations: DESTRUCTIVE,
    },
    (args) =>
      runTool(userId, 'request_introduction', args, () => mcpRequestIntroduction(userId, args)),
  );
  server.registerTool(
    'check_my_inbox',
    {
      title: connectorTitle('check_my_inbox'),
      description: connectorDescription('check_my_inbox'),
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () => runTool(userId, 'check_my_inbox', {}, () => mcpCheckInbox(userId)),
  );
  server.registerTool(
    'snooze_update',
    {
      title: connectorTitle('snooze_update'),
      description: connectorDescription('snooze_update'),
      inputSchema: {
        update_ref: z.string().describe(PARAM_TEXTS.updateRef),
        days: z.number().int().min(1).max(30).optional().describe(PARAM_TEXTS.snoozeDays),
      },
      annotations: DESTRUCTIVE,
    },
    (args) => runTool(userId, 'snooze_update', args, () => mcpSnoozeUpdate(userId, args)),
  );
  server.registerTool(
    'respond_to_request',
    {
      title: connectorTitle('respond_to_request'),
      description: connectorDescription('respond_to_request'),
      inputSchema: {
        request_ref: z.string().describe(PARAM_TEXTS.requestRef),
        accept: z.boolean().describe(PARAM_TEXTS.accept),
        response: z.string().optional().describe(PARAM_TEXTS.responseNote),
      },
      annotations: DESTRUCTIVE,
    },
    (args) => runTool(userId, 'respond_to_request', args, () => mcpRespondToRequest(userId, args)),
  );
  // Engine T11: never destructive (nothing is sent to the non-member — the
  // user pastes the text themselves), so a plain write annotation.
  server.registerTool(
    'invite_contact',
    {
      title: connectorTitle('invite_contact'),
      description: connectorDescription('invite_contact'),
      inputSchema: {
        contact_ref: z.string().describe(PARAM_TEXTS.contactRef),
        language: z.string().optional().describe(PARAM_TEXTS.inviteLanguage),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args) => runTool(userId, 'invite_contact', args, () => mcpInviteContact(userId, args)),
  );
  // Engine T3: a bare, unlimited invite link — never messages anyone, no
  // destructive/write footprint beyond the sent-event log, so READ_ONLY.
  server.registerTool(
    'get_invite_link',
    {
      title: connectorTitle('get_invite_link'),
      description: connectorDescription('get_invite_link'),
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () => runTool(userId, 'get_invite_link', {}, () => mcpGetInviteLink(userId)),
  );
  // Ticket 6 (24 Aug): T2's ambiguity queue, contact_ref only — never a raw
  // phone number crosses this boundary, same guarantee as every other tool.
  server.registerTool(
    'get_unresolved_labels',
    {
      title: connectorTitle('get_unresolved_labels'),
      description: connectorDescription('get_unresolved_labels'),
      inputSchema: { limit: z.number().optional().describe(PARAM_TEXTS.labelQueueLimit) },
      annotations: READ_ONLY,
    },
    (args) =>
      runTool(userId, 'get_unresolved_labels', args, () => mcpGetUnresolvedLabels(userId, args)),
  );
  server.registerTool(
    'get_intro_status',
    {
      title: connectorTitle('get_intro_status'),
      description: connectorDescription('get_intro_status'),
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () => runTool(userId, 'get_intro_status', {}, () => mcpGetIntroStatus(userId)),
  );
}

// Private, reversible writes (facts, blocks) — not destructive in the
// third-party sense, so no forced confirmation like request_introduction.
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

// Part H (ticket 6 task 3): the same chat-embedded personalization
// questions, on the connector too — the registryParity test covers this
// pair so it can't drift the way invite_contact/get_intro_status/
// remove_contact_from_network once did.
function registerProfileQuestionTools(server: McpServer, userId: string): void {
  server.registerTool(
    'get_profile_question',
    {
      title: connectorTitle('get_profile_question'),
      description: connectorDescription('get_profile_question'),
      inputSchema: {
        moment: z.string().optional().describe(PARAM_TEXTS.profileQuestionMoment),
        language: z.string().optional().describe(PARAM_TEXTS.profileQuestionLanguage),
      },
      annotations: READ_ONLY,
    },
    (args) =>
      runTool(userId, 'get_profile_question', args, () => mcpGetProfileQuestion(userId, args)),
  );
  server.registerTool(
    'answer_profile_question',
    {
      title: connectorTitle('answer_profile_question'),
      description: connectorDescription('answer_profile_question'),
      inputSchema: {
        question_id: z.string().describe(PARAM_TEXTS.profileQuestionId),
        option_ids: z.array(z.string()).optional().describe(PARAM_TEXTS.profileOptionIds),
        free_text: z.string().optional().describe(PARAM_TEXTS.profileFreeText),
        skipped: z.boolean().optional().describe(PARAM_TEXTS.profileSkipped),
      },
      annotations: WRITE,
    },
    (args) =>
      runTool(userId, 'answer_profile_question', args, () =>
        mcpAnswerProfileQuestion(userId, args),
      ),
  );
}

function registerMemoryAndBlockTools(server: McpServer, userId: string): void {
  server.registerTool(
    'save_contact_fact',
    {
      title: connectorTitle('save_contact_fact'),
      description: connectorDescription('save_contact_fact'),
      inputSchema: {
        contact_ref: z.string().describe(PARAM_TEXTS.contactRef),
        field_type: z.string().describe(PARAM_TEXTS.factFieldType),
        value: z.string().describe(PARAM_TEXTS.factValue),
        source: z
          .enum(['chat', 'debrief'])
          .optional()
          .describe(
            'Omit normally (defaults to "chat"); "debrief" ONLY when saving the answer to a ' +
              'debrief question from get_pending_updates',
          ),
        confidence: z
          .enum(['stated', 'mentioned'])
          .optional()
          .describe(
            '"stated" (default) ONLY when the USER said it in their own words. "mentioned" when it ' +
              'comes from a web page, a search result, a label or your own reading between the ' +
              'lines — never published as confirmed. Never save a guess ("possibly", "probably").',
          ),
      },
      annotations: WRITE,
    },
    (args) => runTool(userId, 'save_contact_fact', args, () => mcpSaveContactFact(userId, args)),
  );
  server.registerTool(
    'get_contact_facts',
    {
      title: connectorTitle('get_contact_facts'),
      description: connectorDescription('get_contact_facts'),
      inputSchema: { contact_ref: z.string().describe(PARAM_TEXTS.contactRef) },
      annotations: READ_ONLY,
    },
    (args) => runTool(userId, 'get_contact_facts', args, () => mcpGetContactFacts(userId, args)),
  );
  server.registerTool(
    'block_contact',
    {
      title: connectorTitle('block_contact'),
      description: connectorDescription('block_contact'),
      inputSchema: { contact_ref: z.string().describe(PARAM_TEXTS.contactRef) },
      annotations: WRITE,
    },
    (args) => runTool(userId, 'block_contact', args, () => mcpBlockContact(userId, args)),
  );
  server.registerTool(
    'unblock_contact',
    {
      title: connectorTitle('unblock_contact'),
      description: connectorDescription('unblock_contact'),
      inputSchema: { contact_ref: z.string().describe(PARAM_TEXTS.contactRef) },
      annotations: WRITE,
    },
    (args) => runTool(userId, 'unblock_contact', args, () => mcpUnblockContact(userId, args)),
  );
  server.registerTool(
    'list_blocked_contacts',
    {
      title: connectorTitle('list_blocked_contacts'),
      description: connectorDescription('list_blocked_contacts'),
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () => runTool(userId, 'list_blocked_contacts', {}, () => mcpListBlocked(userId)),
  );
  server.registerTool(
    'remove_contact_from_network',
    {
      title: connectorTitle('remove_contact_from_network'),
      description: connectorDescription('remove_contact_from_network'),
      inputSchema: {
        contact_ref: z.string().describe(PARAM_TEXTS.contactRef),
        confirmed: z.boolean().optional().describe(PARAM_TEXTS.removeConfirmed),
      },
      annotations: DESTRUCTIVE,
    },
    (args) =>
      runTool(userId, 'remove_contact_from_network', args, () =>
        mcpRemoveContactFromNetwork(userId, args),
      ),
  );
}

function registerGoalTools(server: McpServer, userId: string): void {
  server.registerTool(
    'create_task',
    {
      title: connectorTitle('create_task'),
      description: connectorDescription('create_task'),
      inputSchema: {
        title: z.string().describe(PARAM_TEXTS.taskTitle),
        description: z.string().optional().describe(PARAM_TEXTS.taskDescription),
        task_type: z.enum(['solve', 'reach']).optional().describe(PARAM_TEXTS.taskType),
        separate: z.boolean().optional().describe(PARAM_TEXTS.taskSeparate),
      },
      annotations: WRITE,
    },
    (args) => runTool(userId, 'create_task', args, () => mcpCreateTask(userId, args)),
  );
  server.registerTool(
    'get_my_tasks',
    {
      title: connectorTitle('get_my_tasks'),
      description: connectorDescription('get_my_tasks'),
      inputSchema: {
        status: z.enum(['open', 'paused', 'closed']).optional().describe(PARAM_TEXTS.taskStatus),
      },
      annotations: READ_ONLY,
    },
    (args) => runTool(userId, 'get_my_tasks', args, () => mcpGetMyTasks(userId, args)),
  );
  server.registerTool(
    'update_task',
    {
      title: connectorTitle('update_task'),
      description: connectorDescription('update_task'),
      inputSchema: {
        task_ref: z.string().describe(PARAM_TEXTS.taskRef),
        status: z.enum(['open', 'paused', 'closed']).describe(PARAM_TEXTS.taskStatus),
        note: z.string().optional().describe(PARAM_TEXTS.taskNote),
      },
      annotations: WRITE,
    },
    (args) => runTool(userId, 'update_task', args, () => mcpUpdateTask(userId, args)),
  );
  server.registerTool(
    'save_goal_feedback',
    {
      title: connectorTitle('save_goal_feedback'),
      description: connectorDescription('save_goal_feedback'),
      inputSchema: {
        task_ref: z.string().describe(PARAM_TEXTS.taskRef),
        question_key: z.string().describe('From the goal_feedback item.'),
        answer: z.string().describe('What the owner said, word for word.'),
      },
      annotations: WRITE,
    },
    (args) => runTool(userId, 'save_goal_feedback', args, () => mcpSaveGoalFeedback(userId, args)),
  );
  server.registerTool(
    'grant_task_permission',
    {
      title: connectorTitle('grant_task_permission'),
      description: connectorDescription('grant_task_permission'),
      inputSchema: { task_ref: z.string().describe(PARAM_TEXTS.taskRef) },
      annotations: WRITE,
    },
    (args) =>
      runTool(userId, 'grant_task_permission', args, () => mcpGrantTaskPermission(userId, args)),
  );
  server.registerTool(
    'propose_task_plan',
    {
      title: connectorTitle('propose_task_plan'),
      description: connectorDescription('propose_task_plan'),
      inputSchema: {
        task_ref: z.string().describe(PARAM_TEXTS.taskRef),
        plan: z
          .object({
            solved_when: z.string().describe('What the user will call solved.'),
            routes: z
              .array(
                z.object({
                  name: z.string(),
                  status: z.enum(['running', 'waiting', 'done', 'dropped']).optional(),
                }),
              )
              .describe('The routes you will pursue, a few words each.'),
            people_to_involve: z
              .array(
                z.object({
                  name: z.string(),
                  contact_ref: z.string().describe(PARAM_TEXTS.contactRef),
                  route: z.string().describe("One of the plan's route names."),
                }),
              )
              .describe('Whom you will write to, each with the route they belong to.'),
            never_contact: z
              .array(z.object({ name: z.string(), contact_ref: z.string().optional() }))
              .describe('Whom the user does NOT want contacted.'),
            real_work: z
              .boolean()
              .optional()
              .describe('Real work rather than a small favour: five people per wave, not three.'),
          })
          .describe('The plan, in the four parts the user approves.'),
      },
      annotations: WRITE,
    },
    (args) => runTool(userId, 'propose_task_plan', args, () => mcpProposeTaskPlan(userId, args)),
  );
  server.registerTool(
    'approve_task_plan',
    {
      title: connectorTitle('approve_task_plan'),
      description: connectorDescription('approve_task_plan'),
      inputSchema: {
        task_ref: z.string().describe(PARAM_TEXTS.taskRef),
        confirmed: z.boolean().describe('true only after the user explicitly said yes.'),
      },
      annotations: WRITE,
    },
    (args) => runTool(userId, 'approve_task_plan', args, () => mcpApproveTaskPlan(userId, args)),
  );
  server.registerTool(
    'save_user_note',
    {
      title: connectorTitle('save_user_note'),
      description: connectorDescription('save_user_note'),
      inputSchema: {
        kind: z.enum(['need', 'preference', 'profile']).describe(PARAM_TEXTS.userNoteKind),
        text: z.string().describe(PARAM_TEXTS.userNoteText),
      },
      annotations: WRITE,
    },
    (args) => runTool(userId, 'save_user_note', args, () => mcpSaveUserNote(userId, args)),
  );
  server.registerTool(
    'get_user_notes',
    {
      title: connectorTitle('get_user_notes'),
      description: connectorDescription('get_user_notes'),
      inputSchema: {
        kind: z
          .enum(['need', 'preference', 'profile'])
          .optional()
          .describe(PARAM_TEXTS.userNoteKind),
      },
      annotations: READ_ONLY,
    },
    (args) => runTool(userId, 'get_user_notes', args, () => mcpGetUserNotes(userId, args)),
  );
  server.registerTool(
    'forget_user_note',
    {
      title: connectorTitle('forget_user_note'),
      description: connectorDescription('forget_user_note'),
      inputSchema: {
        note_ref: z.string().describe('The note_ref from get_user_notes, e.g. note_42'),
      },
    },
    (args) => runTool(userId, 'forget_user_note', args, () => mcpForgetUserNote(userId, args)),
  );
  server.registerTool(
    'list_answer_rules',
    {
      title: connectorTitle('list_answer_rules'),
      description: connectorDescription('list_answer_rules'),
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () => runTool(userId, 'list_answer_rules', {}, () => mcpListAnswerRules(userId)),
  );
  server.registerTool(
    'delete_answer_rule',
    {
      title: connectorTitle('delete_answer_rule'),
      description: connectorDescription('delete_answer_rule'),
      inputSchema: { rule_id: z.number().describe('The rule, from list_answer_rules.') },
      annotations: WRITE,
    },
    (args) => runTool(userId, 'delete_answer_rule', args, () => mcpDeleteAnswerRule(userId, args)),
  );
  server.registerTool(
    'queue_result',
    {
      title: connectorTitle('queue_result'),
      description: connectorDescription('queue_result'),
      inputSchema: {
        kind: z.string().describe(PARAM_TEXTS.updateKind),
        summary: z.string().describe(PARAM_TEXTS.updateSummary),
        task_ref: z.string().optional().describe(PARAM_TEXTS.taskRef),
        contact_ref: z.string().optional().describe(PARAM_TEXTS.contactRef),
      },
      annotations: WRITE,
    },
    (args) => runTool(userId, 'queue_result', args, () => mcpQueueResult(userId, args)),
  );
  server.registerTool(
    'record_search_outcome',
    {
      title: connectorTitle('record_search_outcome'),
      description: connectorDescription('record_search_outcome'),
      inputSchema: {
        search_id: z.number().describe('The search_id from a prior search result'),
        outcome: z.enum(SEARCH_OUTCOMES).describe(`One of: ${SEARCH_OUTCOMES.join(', ')}`),
        reason: z
          .string()
          .optional()
          .describe('Why refused — only meaningful with outcome=refused'),
        worked: z
          .boolean()
          .optional()
          .describe('With outcome=followed_up: did it actually help (true/false)'),
      },
      annotations: WRITE,
    },
    (args) =>
      runTool(userId, 'record_search_outcome', args, () => mcpRecordSearchOutcome(userId, args)),
  );
  server.registerTool(
    'correct_contact_fact',
    {
      title: connectorTitle('correct_contact_fact'),
      description: connectorDescription('correct_contact_fact'),
      inputSchema: {
        contact_ref: z.string().describe(PARAM_TEXTS.contactRef),
        wrong_value: z
          .string()
          .describe('The claim that is wrong, in its own words: „angel investor", „TBC Bank".'),
        field_type: z
          .string()
          .optional()
          .describe('Optional: the field it was stored in (occupation, role, employer…).'),
      },
      annotations: WRITE,
    },
    (args) =>
      runTool(userId, 'correct_contact_fact', args, () => mcpCorrectContactFact(userId, args)),
  );
  server.registerTool(
    'save_close_contact',
    {
      title: connectorTitle('save_close_contact'),
      description: connectorDescription('save_close_contact'),
      inputSchema: {
        contact_ref: z.string().describe(PARAM_TEXTS.contactRef),
        could_use_netai: z
          .boolean()
          .optional()
          .describe('True only if the user said this person would find Netai useful.'),
      },
      annotations: WRITE,
    },
    (args) => runTool(userId, 'save_close_contact', args, () => mcpSaveCloseContact(userId, args)),
  );
  server.registerTool(
    'save_contact_relationship',
    {
      title: connectorTitle('save_contact_relationship'),
      description: connectorDescription('save_contact_relationship'),
      inputSchema: {
        contact_ref_a: z.string().describe(PARAM_TEXTS.contactRef),
        contact_ref_b: z.string().describe(PARAM_TEXTS.contactRef),
        relation: z
          .string()
          .describe('The tie, short and lowercase: brother, spouse, colleague, business_partner…'),
      },
      annotations: WRITE,
    },
    (args) =>
      runTool(userId, 'save_contact_relationship', args, () =>
        mcpSaveContactRelationship(userId, args),
      ),
  );
  server.registerTool(
    'forget_contact_relationship',
    {
      title: connectorTitle('forget_contact_relationship'),
      description: connectorDescription('forget_contact_relationship'),
      inputSchema: {
        contact_ref_a: z.string().describe(PARAM_TEXTS.contactRef),
        contact_ref_b: z.string().describe(PARAM_TEXTS.contactRef),
        relation: z.string().optional().describe('The specific tie to remove; omit for all'),
      },
      annotations: DESTRUCTIVE,
    },
    (args) =>
      runTool(userId, 'forget_contact_relationship', args, () =>
        mcpForgetContactRelationship(userId, args),
      ),
  );
  server.registerTool(
    'get_contact_relationships',
    {
      title: connectorTitle('get_contact_relationships'),
      description: connectorDescription('get_contact_relationships'),
      inputSchema: {
        contact_ref: z.string().optional().describe(PARAM_TEXTS.contactRef),
      },
      annotations: READ_ONLY,
    },
    (args) =>
      runTool(userId, 'get_contact_relationships', args, () =>
        mcpGetContactRelationships(userId, args),
      ),
  );
  server.registerTool(
    'record_debrief_outcome',
    {
      title: connectorTitle('record_debrief_outcome'),
      description: connectorDescription('record_debrief_outcome'),
      inputSchema: {
        subject: z
          .enum(['introduction', 'relayed_ask'])
          .describe('From the debrief item: "introduction" or "relayed_ask"'),
        ref_id: z.number().describe('The intro_request_id or ask_id from the debrief item payload'),
        worked: z.boolean().describe('true = it genuinely helped'),
      },
      annotations: WRITE,
    },
    (args) =>
      runTool(userId, 'record_debrief_outcome', args, () => mcpRecordDebriefOutcome(userId, args)),
  );
  server.registerTool(
    'answer_goal_question',
    {
      title: connectorTitle('answer_goal_question'),
      description: connectorDescription('answer_goal_question'),
      inputSchema: {
        task_id: z.number().describe('The goal the question belongs to (from the item payload)'),
        answer: z.string().describe("The user's answer, verbatim or near it"),
      },
      annotations: WRITE,
    },
    (args) =>
      runTool(userId, 'answer_goal_question', args, () => mcpAnswerGoalQuestion(userId, args)),
  );
  server.registerTool(
    'respond_to_thanks_loop_offer',
    {
      title: connectorTitle('respond_to_thanks_loop_offer'),
      description: connectorDescription('respond_to_thanks_loop_offer'),
      inputSchema: {
        consented: z.boolean().describe(PARAM_TEXTS.thanksLoopConsented),
      },
      annotations: WRITE,
    },
    (args) =>
      runTool(userId, 'respond_to_thanks_loop_offer', args, () =>
        mcpRespondToThanksLoopOffer(userId, args),
      ),
  );
  server.registerTool(
    'get_pending_updates',
    {
      title: connectorTitle('get_pending_updates'),
      description: connectorDescription('get_pending_updates'),
      inputSchema: {
        include_seen: z
          .boolean()
          .optional()
          .describe(
            'true = also list the updates already shown in earlier conversations (already_shown), read-only. Default false.',
          ),
      },
      annotations: READ_ONLY,
    },
    (args) =>
      runTool(userId, 'get_pending_updates', args, () =>
        mcpGetPendingUpdates(userId, { include_seen: args.include_seen === true }),
      ),
  );
  server.registerTool(
    'ask_contact',
    {
      title: connectorTitle('ask_contact'),
      description: connectorDescription('ask_contact'),
      inputSchema: {
        task_ref: z.string().describe(PARAM_TEXTS.taskRef),
        contact_ref: z.string().describe(PARAM_TEXTS.contactRef),
        question: z.string().describe(PARAM_TEXTS.askQuestion),
      },
      annotations: WRITE,
    },
    (args) => runTool(userId, 'ask_contact', args, () => mcpAskContact(userId, args)),
  );
  server.registerTool(
    'set_task_brief',
    {
      title: connectorTitle('set_task_brief'),
      description: connectorDescription('set_task_brief'),
      inputSchema: {
        task_ref: z.string().describe(PARAM_TEXTS.taskRef),
        brief: z.string().describe(PARAM_TEXTS.taskBrief),
      },
      annotations: WRITE,
    },
    (args) => runTool(userId, 'set_task_brief', args, () => mcpSetTaskBrief(userId, args)),
  );
  server.registerTool(
    'set_task_wake',
    {
      title: connectorTitle('set_task_wake'),
      description: connectorDescription('set_task_wake'),
      inputSchema: {
        task_ref: z.string().describe(PARAM_TEXTS.taskRef),
        hours: z.number().int().min(1).max(168).describe(PARAM_TEXTS.wakeHours),
      },
      annotations: WRITE,
    },
    (args) => runTool(userId, 'set_task_wake', args, () => mcpSetTaskWake(userId, args)),
  );
  server.registerTool(
    'finish_task',
    {
      title: connectorTitle('finish_task'),
      description: connectorDescription('finish_task'),
      inputSchema: {
        task_ref: z.string().describe(PARAM_TEXTS.taskRef),
        summary: z.string().describe(PARAM_TEXTS.finishSummary),
      },
      annotations: WRITE,
    },
    (args) => runTool(userId, 'finish_task', args, () => mcpFinishTask(userId, args)),
  );
  server.registerTool(
    'exclude_contact',
    {
      title: connectorTitle('exclude_contact'),
      description: connectorDescription('exclude_contact'),
      inputSchema: {
        contact_ref: z.string().describe(PARAM_TEXTS.contactRef),
        excluded_for: z.string().describe(PARAM_TEXTS.excludedFor),
        reason: z.string().describe(PARAM_TEXTS.exclusionReason),
        revisit_if: z.string().optional().describe(PARAM_TEXTS.revisitIf),
      },
      annotations: WRITE,
    },
    (args) => runTool(userId, 'exclude_contact', args, () => mcpExcludeContact(userId, args)),
  );
  server.registerTool(
    'remove_contact_exclusion',
    {
      title: connectorTitle('remove_contact_exclusion'),
      description: connectorDescription('remove_contact_exclusion'),
      inputSchema: {
        contact_ref: z.string().describe(PARAM_TEXTS.contactRef),
        excluded_for: z.string().optional().describe(PARAM_TEXTS.excludedFor),
      },
      annotations: WRITE,
    },
    (args) =>
      runTool(userId, 'remove_contact_exclusion', args, () => mcpRemoveExclusion(userId, args)),
  );
  server.registerTool(
    'mark_contact_deceased',
    {
      title: connectorTitle('mark_contact_deceased'),
      description: connectorDescription('mark_contact_deceased'),
      inputSchema: { contact_ref: z.string().describe(PARAM_TEXTS.contactRef) },
      annotations: DESTRUCTIVE,
    },
    (args) =>
      runTool(userId, 'mark_contact_deceased', args, () => mcpMarkContactDeceased(userId, args)),
  );
  server.registerTool(
    'retract_contact_fact',
    {
      title: connectorTitle('retract_contact_fact'),
      description: connectorDescription('retract_contact_fact'),
      inputSchema: {
        contact_ref: z.string().describe(PARAM_TEXTS.contactRef),
        field_type: z.string().optional().describe(PARAM_TEXTS.retractFieldType),
        value_fragment: z.string().optional().describe(PARAM_TEXTS.retractValueFragment),
        exact_value: z.string().optional().describe(PARAM_TEXTS.retractExactValue),
      },
      annotations: WRITE,
    },
    (args) => runTool(userId, 'retract_contact_fact', args, () => mcpRetractFact(userId, args)),
  );
  server.registerTool(
    'forget_contact_fact',
    {
      title: connectorTitle('forget_contact_fact'),
      description: connectorDescription('forget_contact_fact'),
      inputSchema: {
        contact_ref: z.string().describe(PARAM_TEXTS.contactRef),
        field_type: z.string().optional().describe(PARAM_TEXTS.retractFieldType),
        value_fragment: z.string().optional().describe(PARAM_TEXTS.retractValueFragment),
        exact_value: z.string().optional().describe(PARAM_TEXTS.retractExactValue),
        confirmed: z.boolean().optional().describe(PARAM_TEXTS.forgetConfirmed),
      },
      annotations: DESTRUCTIVE,
    },
    (args) => runTool(userId, 'forget_contact_fact', args, () => mcpForgetFact(userId, args)),
  );
}

function registerGraphTools(server: McpServer, userId: string): void {
  server.registerTool(
    'get_top_connectors',
    {
      title: connectorTitle('get_top_connectors'),
      description: connectorDescription('get_top_connectors'),
      inputSchema: {
        limit: z.number().int().positive().optional().describe(PARAM_TEXTS.connectorLimit),
      },
      annotations: READ_ONLY,
    },
    (args) => runTool(userId, 'get_top_connectors', args, () => mcpGetTopConnectors(userId, args)),
  );
  server.registerTool(
    'get_group_connectors',
    {
      title: connectorTitle('get_group_connectors'),
      description: connectorDescription('get_group_connectors'),
      inputSchema: {
        group_tag: z.string().describe(PARAM_TEXTS.groupTag),
        limit: z.number().int().positive().optional().describe(PARAM_TEXTS.connectorLimit),
      },
      annotations: READ_ONLY,
    },
    (args) =>
      runTool(userId, 'get_group_connectors', args, () => mcpGetGroupConnectors(userId, args)),
  );
  server.registerTool(
    'search_roster',
    {
      title: connectorTitle('search_roster'),
      description: connectorDescription('search_roster'),
      inputSchema: {
        group: z.string().describe('The network, e.g. "Axel".'),
        name: z.string().optional().describe('Optional: words of the name to look for.'),
      },
      annotations: READ_ONLY,
    },
    (args) => runTool(userId, 'search_roster', args, () => mcpSearchRoster(userId, args)),
  );
  server.registerTool(
    'find_warm_path',
    {
      title: connectorTitle('find_warm_path'),
      description: connectorDescription('find_warm_path'),
      inputSchema: {
        target_ref: z.string().describe("The target's contact_ref from a search result."),
        max_hops: z.number().optional().describe('Optional, 1–5 (default 5).'),
      },
      annotations: READ_ONLY,
    },
    (args) => runTool(userId, 'find_warm_path', args, () => mcpFindWarmPath(userId, args)),
  );
  server.registerTool(
    'get_upcoming_birthdays',
    {
      title: connectorTitle('get_upcoming_birthdays'),
      description: connectorDescription('get_upcoming_birthdays'),
      inputSchema: {
        days: z.number().int().positive().optional().describe(PARAM_TEXTS.birthdayWindowDays),
      },
      annotations: READ_ONLY,
    },
    (args) =>
      runTool(userId, 'get_upcoming_birthdays', args, () => mcpGetUpcomingBirthdays(userId, args)),
  );
  server.registerTool(
    'get_curiosity_queue',
    {
      title: connectorTitle('get_curiosity_queue'),
      description: connectorDescription('get_curiosity_queue'),
      inputSchema: {
        limit: z.number().int().positive().optional().describe(PARAM_TEXTS.curiosityLimit),
      },
      annotations: READ_ONLY,
    },
    (args) =>
      runTool(userId, 'get_curiosity_queue', args, () => mcpGetCuriosityQueue(userId, args)),
  );
  server.registerTool(
    'get_country_channels',
    {
      title: connectorTitle('get_country_channels'),
      description: connectorDescription('get_country_channels'),
      inputSchema: {
        country: z.string().describe(PARAM_TEXTS.country),
        known_institutions: z.array(z.string()).optional().describe(PARAM_TEXTS.knownInstitutions),
      },
      annotations: READ_ONLY,
    },
    (args) =>
      runTool(userId, 'get_country_channels', args, () => mcpGetCountryChannels(userId, args)),
  );
  server.registerTool(
    'get_netai_info',
    {
      title: connectorTitle('get_netai_info'),
      description: connectorDescription('get_netai_info'),
      inputSchema: {
        topic: z.string().describe(PARAM_TEXTS.netaiInfoTopic),
      },
      annotations: READ_ONLY,
    },
    (args) => runTool(userId, 'get_netai_info', args, () => mcpGetNetaiInfo(userId, args)),
  );
  server.registerTool(
    'stop_contacting_me',
    {
      title: connectorTitle('stop_contacting_me'),
      description: connectorDescription('stop_contacting_me'),
      inputSchema: {
        confirmed: z.boolean().describe(PARAM_TEXTS.optOutConfirmed),
        reason: z.string().optional().describe(PARAM_TEXTS.optOutReason),
      },
      annotations: WRITE,
    },
    (args) => runTool(userId, 'stop_contacting_me', args, () => mcpStopContactingMe(userId, args)),
  );
  server.registerTool(
    'allow_contacting_me',
    {
      title: connectorTitle('allow_contacting_me'),
      description: connectorDescription('allow_contacting_me'),
      inputSchema: {},
      annotations: WRITE,
    },
    () => runTool(userId, 'allow_contacting_me', {}, () => mcpAllowContactingMe(userId)),
  );
}

function promptMessage(text: string): {
  messages: { role: 'user'; content: { type: 'text'; text: string } }[];
} {
  return { messages: [{ role: 'user', content: { type: 'text', text } }] };
}

// Ready-made scenarios for claude.ai's "+" menu. They carry user-message
// strength — stronger than any passive hint the connector can give.
/** 1256: the user answers a question another member asked them (questions_for_me). */
function registerMemberAnswerTool(server: McpServer, userId: string): void {
  server.registerTool(
    'answer_member_question',
    {
      title: connectorTitle('answer_member_question'),
      description: connectorDescription('answer_member_question'),
      inputSchema: {
        ask_id: z.string().describe(PARAM_TEXTS.memberAskId),
        answer: z.string().describe(PARAM_TEXTS.memberAnswer),
        confirmed: z.boolean().describe(PARAM_TEXTS.memberAnswerConfirmed),
      },
      annotations: WRITE,
    },
    (args) =>
      runTool(userId, 'answer_member_question', args, () => mcpAnswerMemberQuestion(userId, args)),
  );
}

function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'find_in_network',
    {
      title: PROMPT_TEXTS.find_in_network.title,
      description: PROMPT_TEXTS.find_in_network.description,
      argsSchema: { field: z.string().describe(PROMPT_TEXTS.find_in_network.argField) },
    },
    ({ field }) => promptMessage(PROMPT_TEXTS.find_in_network.build(field)),
  );
  server.registerPrompt(
    'request_intro',
    {
      title: PROMPT_TEXTS.request_intro.title,
      description: PROMPT_TEXTS.request_intro.description,
      argsSchema: {
        who: z.string().describe(PROMPT_TEXTS.request_intro.argWho),
        purpose: z.string().describe(PROMPT_TEXTS.request_intro.argPurpose),
      },
    },
    ({ who, purpose }) => promptMessage(PROMPT_TEXTS.request_intro.build(who, purpose)),
  );
  server.registerPrompt(
    'network_overview',
    {
      title: PROMPT_TEXTS.network_overview.title,
      description: PROMPT_TEXTS.network_overview.description,
    },
    () => promptMessage(PROMPT_TEXTS.network_overview.build()),
  );
  server.registerPrompt(
    'build_target_list',
    {
      title: PROMPT_TEXTS.build_target_list.title,
      description: PROMPT_TEXTS.build_target_list.description,
      argsSchema: { goal: z.string().describe(PROMPT_TEXTS.build_target_list.argGoal) },
    },
    ({ goal }) => promptMessage(PROMPT_TEXTS.build_target_list.build(goal)),
  );
  server.registerPrompt(
    'invite_people',
    {
      title: PROMPT_TEXTS.invite_people.title,
      description: PROMPT_TEXTS.invite_people.description,
      argsSchema: { who: z.string().optional().describe(PROMPT_TEXTS.invite_people.argWho) },
    },
    ({ who }) => promptMessage(PROMPT_TEXTS.invite_people.build(who ?? '')),
  );
}

/**
 * One MCP server per request, bound to the authenticated user. Nothing is
 * shared between requests, so sessions can never bleed into each other.
 */
export function buildMcpServer(userId: string): McpServer {
  const server = new McpServer(
    {
      name: MCP_SERVER_NAME,
      title: MCP_SERVER_TITLE,
      version: MCP_SERVER_VERSION,
      icons: [{ src: NETAI_STILL_IMAGE_URL, mimeType: 'image/jpeg' }],
    },
    { instructions: MCP_SERVER_INSTRUCTIONS },
  );
  registerSearchTools(server, userId);
  registerProfileTools(server, userId);
  registerIntroTools(server, userId);
  registerProfileQuestionTools(server, userId);
  registerMemoryAndBlockTools(server, userId);
  registerGraphTools(server, userId);
  registerGoalTools(server, userId);
  if (ANSWER_MEMBER_QUESTION_ON) registerMemberAnswerTool(server, userId);
  registerPrompts(server);
  return server;
}

/**
 * #5677 (D818): the app tools the connector has no copy of, registered as the
 * app defines them and run by the app's handler. Behind SHARED_TOOLS_FLAG.
 */
async function registerSharedAppTools(server: McpServer, userId: string): Promise<void> {
  const tools = sharedAppTools(await appToolsForConnector(userId), CONNECTOR_OWN_TOOLS);
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: connectorTitle(tool.name),
        description: tool.description,
        inputSchema: connectorInputShape(tool, PARAM_TEXTS.contactRef),
        annotations: SHARED_TOOL_ANNOTATIONS,
      },
      (args: Record<string, unknown>) =>
        runTool(userId, tool.name, args, () =>
          runSharedTool(userId, tool.name, args, (name, input) =>
            runAppToolForConnector(userId, name, input),
          ),
        ),
    );
  }
}

/** The connector for one request: its own tools, and the app's when the switch is on. */
export async function buildConnectorServer(userId: string): Promise<McpServer> {
  const server = buildMcpServer(userId);
  if (await isSharedToolsEnabled()) await registerSharedAppTools(server, userId);
  return server;
}
