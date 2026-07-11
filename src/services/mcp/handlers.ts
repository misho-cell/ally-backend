import { query } from '../../db/postgres/client';
import { searchByTag } from '../tools/searchByTag';
import { searchContactByName } from '../tools/searchContactByName';
import { searchByInsight } from '../tools/searchByInsight';
import { searchSecondDegree } from '../tools/searchSecondDegree';
import { getContactCount } from '../tools/getContactCount';
import { getContactFullProfile, isDisplayableTag } from '../tools/getContactFullProfile';
import { requestIntroduction } from '../tools/requestIntroduction';
import { respondToIntroduction } from '../tools/respondToIntroduction';
import { normalizeFieldType, getVisibleFacts, submitContactFact } from '../contactFacts.service';
import {
  createTask,
  getMyTasks,
  grantTaskPermission,
  isTaskStatus,
  updateTask,
} from '../taskStore.service';
import { getUserNotes, isUserNoteKind, saveUserNote } from '../userNotes.service';
import { countHeldUpdates, getPendingUpdates, queueResult } from '../pendingUpdates.service';
import {
  blockContact,
  getBlockedByUser,
  getExcludedPhoneSet,
  unblockContact,
} from '../block.service';
import { normalizePhone } from '../phone';
import { ConnectorOutcome, getGroupConnectors, getTopConnectors } from '../graphAnalytics.service';
import {
  getPendingRequestsForMediator,
  getRecentResponsesForRequester,
} from '../introduction.service';
import { isReplySafe } from '../moderation.service';
import { decodeContactRef, encodeContactRef } from './contactRef';
import { scrubDeep, scrubText } from './privacy';
import {
  NOTE_EMPTY_INSIGHT,
  NOTE_EMPTY_SECOND_DEGREE,
  NOTE_EMPTY_TAG,
  NOTE_FUZZY,
  NOTE_INTRO_SENT,
  NOTE_RATE_LIMITED,
  noteInboxPending,
  noteTruncated,
} from './texts';

// One MCP tool call = one handler here. Handlers wrap the same services the
// in-app agent uses, but everything they return goes to claude.ai — so every
// payload passes the privacy filter and phones are replaced with contact_refs.

export type McpToolPayload = Record<string, unknown>;

const MCP_RESULT_LIMIT = 8;
const TOP_TAG_LIMIT = 25;
const STATS_QUERY_TIMEOUT_MS = 10_000;
const INTRO_COUNT_TIMEOUT_MS = 5_000;
const MAX_INTRO_REQUESTS_PER_DAY = 10;
const REQUEST_REF_PREFIX = 'req_';

// Keys the privacy filter's key-name rule doesn't catch but that are internal
// to the in-app agent and must not reach claude.ai.
const INTERNAL_ROW_KEYS = new Set(['phone', 'target_user_id', 'target_phone', 'contact_id']);

interface SearchRow {
  readonly phone?: string;
  readonly contact_id?: string;
  readonly [key: string]: unknown;
}

interface SearchOutcome {
  readonly found?: boolean;
  readonly count?: number;
  // Real unbounded match count when the tool provides it (vs. the capped page).
  readonly total?: number;
  // Set when the rows came from the spelling-similar fuzzy fallback, not exact.
  readonly fuzzy?: boolean;
  readonly results?: SearchRow[];
}

function toPublicRow(userId: string, row: SearchRow): McpToolPayload {
  const clean: McpToolPayload = {};
  for (const [key, value] of Object.entries(row)) {
    if (!INTERNAL_ROW_KEYS.has(key)) clean[key] = value;
  }
  const refSource = row.contact_id ?? row.phone;
  const publicRow = scrubDeep(clean) as McpToolPayload;
  if (refSource) publicRow.contact_ref = encodeContactRef(userId, refSource);
  return publicRow;
}

function normalizedName(row: SearchRow): string | null {
  const name = typeof row.name === 'string' ? row.name.trim().toLowerCase() : '';
  return name.length > 0 ? name.replace(/\s+/g, ' ') : null;
}

/**
 * Collapse the same person appearing under several raw-contact phones (ISSUE
 * 6): keep the first row per normalized name, drop later duplicates so the
 * 8-slot window fills with distinct people. Nameless rows are never merged.
 */
function dedupeByName(rows: SearchRow[]): SearchRow[] {
  const seen = new Set<string>();
  const out: SearchRow[] = [];
  for (const row of rows) {
    const key = normalizedName(row);
    if (key !== null) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(row);
  }
  return out;
}

function mapSearchResult(userId: string, raw: object, emptyNote: string): McpToolPayload {
  const outcome = raw as SearchOutcome;
  if (!outcome.found || !Array.isArray(outcome.results) || outcome.results.length === 0) {
    return { found: false, note: emptyNote };
  }
  const deduped = dedupeByName(outcome.results);
  // Real total when the tool reports one; else the deduped pool size.
  const total = outcome.total ?? outcome.count ?? deduped.length;
  const rows = deduped.slice(0, MCP_RESULT_LIMIT).map((row) => toPublicRow(userId, row));
  const payload: McpToolPayload = { found: true, total, results: rows };
  // Fuzzy (approximate) matches are flagged so the model treats them as guesses;
  // this takes priority over the truncation note.
  if (outcome.fuzzy) payload.note = NOTE_FUZZY;
  else if (total > rows.length) payload.note = noteTruncated(rows.length, total);
  return payload;
}

export async function mcpSearchContacts(
  userId: string,
  args: { tag?: string; name?: string },
): Promise<McpToolPayload> {
  const tag = args.tag?.trim();
  const name = args.name?.trim();
  if (!tag && !name) {
    return { error: 'Pass either tag or name.' };
  }
  const raw = tag ? await searchByTag(userId, tag) : await searchContactByName(userId, name ?? '');
  return mapSearchResult(userId, raw, NOTE_EMPTY_TAG);
}

export async function mcpSearchByInsight(
  userId: string,
  args: { query: string },
): Promise<McpToolPayload> {
  const insightQuery = args.query?.trim();
  if (!insightQuery) return { error: 'Pass query.' };
  return mapSearchResult(userId, await searchByInsight(userId, insightQuery), NOTE_EMPTY_INSIGHT);
}

export async function mcpSearchSecondDegree(
  userId: string,
  args: { query: string },
): Promise<McpToolPayload> {
  const searchQuery = args.query?.trim();
  if (!searchQuery) return { error: 'Pass query.' };
  return mapSearchResult(
    userId,
    await searchSecondDegree(userId, searchQuery),
    NOTE_EMPTY_SECOND_DEGREE,
  );
}

export async function mcpGetNetworkStats(userId: string): Promise<McpToolPayload> {
  const [countResult, tagResult] = await Promise.all([
    getContactCount(userId),
    query<{ tag: string; contacts: number }>(
      `SELECT tag, COUNT(DISTINCT phone)::int AS contacts
       FROM "UserTags"
       WHERE "contactId" = $1
       GROUP BY tag
       ORDER BY COUNT(DISTINCT phone) DESC
       LIMIT $2`,
      [userId, TOP_TAG_LIMIT],
      STATS_QUERY_TIMEOUT_MS,
    ),
  ]);
  return {
    contact_count: (countResult as { count: number }).count,
    top_tags: tagResult.rows.filter((row) => isDisplayableTag(row.tag)),
  };
}

export async function mcpGetContactProfile(
  userId: string,
  args: { contact_ref: string },
): Promise<McpToolPayload> {
  const phone = decodeContactRef(userId, args.contact_ref ?? '');
  if (!phone) {
    return { error: 'Unknown contact_ref — take it from a fresh search result, never invent it.' };
  }
  if (await isExcludedContact(userId, phone)) return { error: UNAVAILABLE_CONTACT_ERROR };
  const profile = await getContactFullProfile(userId, phone);
  const clean = scrubDeep({
    tags: profile.tags,
    insights: profile.insights,
    facts_and_ask: profile.facts_and_ask,
  }) as McpToolPayload;
  return { contact_ref: args.contact_ref, is_member: profile.is_member, ...clean };
}

async function introRequestsInLastDay(userId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM introduction_requests
     WHERE requester_user_id = $1 AND created_at >= NOW() - INTERVAL '1 day'`,
    [userId],
    INTRO_COUNT_TIMEOUT_MS,
  );
  return Number(result.rows[0]?.count ?? 0);
}

interface IntroOutcome {
  readonly needs_disambiguation?: boolean;
  readonly candidates?: { phone: string; name: string }[];
  readonly success?: boolean;
}

function mapIntroOutcome(userId: string, raw: object): McpToolPayload {
  const outcome = raw as IntroOutcome;
  if (outcome.needs_disambiguation && Array.isArray(outcome.candidates)) {
    return {
      needs_disambiguation: true,
      candidates: outcome.candidates.map((candidate) => ({
        name: candidate.name,
        mediator_ref: encodeContactRef(userId, candidate.phone),
      })),
    };
  }
  const scrubbed = scrubDeep(raw) as McpToolPayload;
  return outcome.success ? { ...scrubbed, note: NOTE_INTRO_SENT } : scrubbed;
}

export async function mcpRequestIntroduction(
  userId: string,
  args: {
    mediator_name: string;
    target_name: string;
    message: string;
    mediator_ref?: string;
    ask_type?: string;
  },
): Promise<McpToolPayload> {
  const askType = args.ask_type === 'share_contact' ? 'share_contact' : 'intro';
  if ((await introRequestsInLastDay(userId)) >= MAX_INTRO_REQUESTS_PER_DAY) {
    return { success: false, note: NOTE_RATE_LIMITED };
  }
  if (!(await isReplySafe(args.message, userId))) {
    return {
      success: false,
      error: 'The drafted message failed moderation — rewrite it plainly and try again.',
    };
  }
  let mediatorPhone: string | undefined;
  if (args.mediator_ref) {
    const decoded = decodeContactRef(userId, args.mediator_ref);
    if (!decoded) {
      return {
        success: false,
        error: 'Unknown mediator_ref — take it from a fresh search result.',
      };
    }
    mediatorPhone = decoded;
  }
  const raw = await requestIntroduction(
    userId,
    args.mediator_name,
    args.target_name,
    args.message,
    mediatorPhone,
    undefined,
    undefined,
    askType,
  );
  return mapIntroOutcome(userId, raw);
}

export async function mcpCheckInbox(userId: string): Promise<McpToolPayload> {
  const [pending, answered] = await Promise.all([
    getPendingRequestsForMediator(userId),
    getRecentResponsesForRequester(userId),
  ]);
  const payload: McpToolPayload = {
    waiting_for_me: pending.map((request) => ({
      request_ref: REQUEST_REF_PREFIX + String(request.id),
      from: request.requester_name,
      wants_to_meet: request.target_name,
      message: request.message === null ? null : scrubText(request.message),
      created_at: scrubDeep(request.created_at),
    })),
    replies_to_my_requests: answered.map((reply) => ({
      request_ref: REQUEST_REF_PREFIX + String(reply.id),
      about: reply.target_name,
      from_mediator: reply.mediator_name,
      ask_type: reply.ask_type,
      status: reply.status,
      // The user's own original reason, so the reply is shown with context.
      original_reason: reply.message === null ? null : scrubText(reply.message),
      note_from_mediator:
        reply.mediator_response === null ? null : scrubText(reply.mediator_response),
      sent_at: scrubDeep(reply.created_at),
      responded_at: scrubDeep(reply.responded_at),
    })),
  };
  if (pending.length > 0) payload.note = noteInboxPending(pending.length);
  return payload;
}

export async function mcpRespondToRequest(
  userId: string,
  args: { request_ref: string; accept: boolean; response?: string },
): Promise<McpToolPayload> {
  const ref = args.request_ref ?? '';
  const requestId = Number(ref.slice(REQUEST_REF_PREFIX.length));
  if (!ref.startsWith(REQUEST_REF_PREFIX) || !Number.isInteger(requestId) || requestId <= 0) {
    return { success: false, error: 'Unknown request_ref — take it from check_my_inbox.' };
  }
  const raw = await respondToIntroduction(userId, requestId, args.accept, args.response);
  return scrubDeep(raw) as McpToolPayload;
}

const UNKNOWN_REF_ERROR =
  'Unknown contact_ref — take it from a fresh search result, never invent it.';
const UNAVAILABLE_CONTACT_ERROR = 'This contact is unavailable.';

// Defense-in-depth block/deceased gate for single-contact reads by ref. Searches
// already exclude these contacts, so a fresh ref should never point at one — but
// a stale/reused ref must not surface a blocked person's profile or facts.
async function isExcludedContact(userId: string, phone: string): Promise<boolean> {
  const excluded = await getExcludedPhoneSet(userId);
  return excluded.has(normalizePhone(phone));
}

export async function mcpSaveContactFact(
  userId: string,
  args: { contact_ref: string; field_type: string; value: string },
): Promise<McpToolPayload> {
  const phone = decodeContactRef(userId, args.contact_ref ?? '');
  if (!phone) return { saved: false, error: UNKNOWN_REF_ERROR };
  const fieldType = normalizeFieldType(args.field_type ?? '');
  if (!fieldType) {
    return {
      saved: false,
      error: 'field_type must be a short non-empty label (e.g. occupation, role, skill, note).',
    };
  }
  const value = (args.value ?? '').trim();
  if (!value) return { saved: false, error: 'Pass a non-empty value.' };

  const result = await submitContactFact(userId, phone, fieldType, value);
  // is_public means the crowd corroborated it; the saved value is still private
  // to this user's assistant either way.
  return { saved: true, field_type: fieldType, crowd_confirmed: result.is_public };
}

export async function mcpGetContactFacts(
  userId: string,
  args: { contact_ref: string },
): Promise<McpToolPayload> {
  const phone = decodeContactRef(userId, args.contact_ref ?? '');
  if (!phone) return { error: UNKNOWN_REF_ERROR };
  if (await isExcludedContact(userId, phone)) return { error: UNAVAILABLE_CONTACT_ERROR };
  const facts = await getVisibleFacts(userId, phone);
  return { contact_ref: args.contact_ref, ...(scrubDeep(facts) as McpToolPayload) };
}

export async function mcpBlockContact(
  userId: string,
  args: { contact_ref: string },
): Promise<McpToolPayload> {
  const phone = decodeContactRef(userId, args.contact_ref ?? '');
  if (!phone) return { blocked: false, error: UNKNOWN_REF_ERROR };
  await blockContact(userId, phone);
  return { blocked: true };
}

export async function mcpUnblockContact(
  userId: string,
  args: { contact_ref: string },
): Promise<McpToolPayload> {
  const phone = decodeContactRef(userId, args.contact_ref ?? '');
  if (!phone) return { unblocked: false, error: UNKNOWN_REF_ERROR };
  await unblockContact(userId, phone);
  return { unblocked: true };
}

export async function mcpListBlocked(userId: string): Promise<McpToolPayload> {
  const blocked = await getBlockedByUser(userId);
  return {
    blocked: blocked.map((entry) => ({
      name: entry.name,
      contact_ref: encodeContactRef(userId, entry.phone),
    })),
  };
}

function mapConnectors(
  userId: string,
  outcome: ConnectorOutcome,
  scoreLabel: string,
): McpToolPayload {
  if (!outcome.found || !outcome.results || outcome.results.length === 0) {
    return { found: false, reason: outcome.reason ?? 'no_connectors' };
  }
  return {
    found: true,
    results: outcome.results.map((r) => ({
      name: r.name,
      contact_ref: encodeContactRef(userId, r.phone),
      [scoreLabel]: r.score,
    })),
  };
}

export async function mcpGetTopConnectors(
  userId: string,
  args: { limit?: number },
): Promise<McpToolPayload> {
  return mapConnectors(userId, await getTopConnectors(userId, args.limit), 'reach');
}

export async function mcpGetGroupConnectors(
  userId: string,
  args: { group_tag: string; limit?: number },
): Promise<McpToolPayload> {
  const groupTag = (args.group_tag ?? '').trim();
  if (!groupTag) return { error: 'Pass group_tag.' };
  return mapConnectors(
    userId,
    await getGroupConnectors(userId, groupTag, args.limit),
    'member_links',
  );
}

// --- Goal store + user memory (B1 + C) --------------------------------------
// Tasks and notes are the user's own content, so no contact_ref/phone handling —
// but text is scrubbed defensively before it reaches the model, same as any
// other payload leaving the connector.

const TASK_REF_PREFIX = 'task_';

function parseTaskRef(ref: string): number | null {
  if (!ref.startsWith(TASK_REF_PREFIX)) return null;
  const id = Number(ref.slice(TASK_REF_PREFIX.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function mcpCreateTask(
  userId: string,
  args: { title: string; description?: string; task_type?: string },
): Promise<McpToolPayload> {
  const title = (args.title ?? '').trim();
  if (!title) return { created: false, error: 'Pass a non-empty title.' };
  const taskType = args.task_type === 'reach' ? 'reach' : 'solve';
  const description = (args.description ?? '').trim() || null;
  const { id } = await createTask(userId, title, description, taskType);
  return { created: true, task_ref: TASK_REF_PREFIX + String(id) };
}

export async function mcpGetMyTasks(
  userId: string,
  args: { status?: string },
): Promise<McpToolPayload> {
  const status = args.status && isTaskStatus(args.status) ? args.status : undefined;
  const tasks = await getMyTasks(userId, status);
  return {
    tasks: tasks.map((t) => ({
      task_ref: TASK_REF_PREFIX + String(t.id),
      title: scrubText(t.title),
      description: t.description === null ? null : scrubText(t.description),
      type: t.task_type,
      status: t.status,
      permission_granted: t.permission_granted,
    })),
  };
}

export async function mcpUpdateTask(
  userId: string,
  args: { task_ref: string; status: string; note?: string },
): Promise<McpToolPayload> {
  const taskId = parseTaskRef(args.task_ref ?? '');
  if (taskId === null) {
    return { updated: false, error: 'Unknown task_ref — take it from get_my_tasks.' };
  }
  if (!isTaskStatus(args.status)) {
    return { updated: false, error: 'status must be open, paused, or closed.' };
  }
  const ok = await updateTask(userId, taskId, args.status, args.note);
  return ok ? { updated: true } : { updated: false, error: 'No such task.' };
}

export async function mcpGrantTaskPermission(
  userId: string,
  args: { task_ref: string },
): Promise<McpToolPayload> {
  const taskId = parseTaskRef(args.task_ref ?? '');
  if (taskId === null) {
    return { granted: false, error: 'Unknown task_ref — take it from get_my_tasks.' };
  }
  const ok = await grantTaskPermission(userId, taskId);
  return ok ? { granted: true } : { granted: false, error: 'No such task.' };
}

export async function mcpSaveUserNote(
  userId: string,
  args: { kind: string; text: string },
): Promise<McpToolPayload> {
  if (!isUserNoteKind(args.kind ?? '')) {
    return { saved: false, error: 'kind must be need, preference, or profile.' };
  }
  const text = (args.text ?? '').trim();
  if (!text) return { saved: false, error: 'Pass a non-empty text.' };
  await saveUserNote(userId, args.kind as 'need' | 'preference' | 'profile', text);
  return { saved: true, kind: args.kind };
}

export async function mcpGetUserNotes(
  userId: string,
  args: { kind?: string },
): Promise<McpToolPayload> {
  const kind = args.kind && isUserNoteKind(args.kind) ? args.kind : undefined;
  const notes = await getUserNotes(userId, kind);
  return {
    notes: notes.map((n) => ({ kind: n.kind, text: scrubText(n.text) })),
  };
}

export async function mcpQueueResult(
  userId: string,
  args: { task_ref?: string; kind: string; summary: string; contact_ref?: string },
): Promise<McpToolPayload> {
  const kind = (args.kind ?? '').trim();
  const summary = (args.summary ?? '').trim();
  if (!kind || !summary) return { queued: false, error: 'Pass kind and summary.' };
  const taskId = args.task_ref ? parseTaskRef(args.task_ref) : null;
  const payload: Record<string, unknown> = { summary };
  if (args.contact_ref) payload.contact_ref = args.contact_ref;
  await queueResult(userId, taskId, kind, payload);
  return { queued: true };
}

export async function mcpGetPendingUpdates(userId: string): Promise<McpToolPayload> {
  const [updates, morePending] = await Promise.all([
    getPendingUpdates(userId),
    countHeldUpdates(userId),
  ]);
  return {
    updates: updates.map((u) => ({
      task_ref: u.task_id === null ? null : TASK_REF_PREFIX + String(u.task_id),
      kind: u.kind,
      ...(scrubDeep(u.payload) as McpToolPayload),
    })),
    more_pending: morePending,
  };
}
