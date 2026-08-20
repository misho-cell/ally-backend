import { query } from '../../db/postgres/client';
import { searchByTag } from '../tools/searchByTag';
import { searchContactByName } from '../tools/searchContactByName';
import { searchByInsight } from '../tools/searchByInsight';
import { searchSecondDegree } from '../tools/searchSecondDegree';
import { searchWithRetry } from '../tools/searchRetry';
import { getContactCount } from '../tools/getContactCount';
import { getContactFullProfile, isDisplayableTag } from '../tools/getContactFullProfile';
import { requestIntroduction } from '../tools/requestIntroduction';
import { respondToIntroduction } from '../tools/respondToIntroduction';
import {
  normalizeFieldType,
  getVisibleFacts,
  submitContactFact,
  retractOwnFacts,
} from '../contactFacts.service';
import {
  createTask,
  getMyTasks,
  getTaskById,
  grantTaskPermission,
  isTaskStatus,
  setTaskBrief,
  setTaskWake,
  updateTask,
} from '../taskStore.service';
import { cancelAsksForTask, createAsk } from '../taskAsks.service';
import { removeContactExclusion, saveContactExclusion } from '../tools/contactExclusions';
import { getUserNotes, isUserNoteKind, saveUserNote } from '../userNotes.service';
import { countHeldUpdates, getPendingUpdates, queueResult } from '../pendingUpdates.service';
import {
  blockContact,
  getBlockedByUser,
  getExcludedPhoneSet,
  unblockContact,
} from '../block.service';
import { normalizePhone } from '../phone';
import { markContactDeceased } from '../deceased.service';
import { ConnectorOutcome, getGroupConnectors, getTopConnectors } from '../graphAnalytics.service';
import {
  getPendingRequestsForMediator,
  getRecentResponsesForRequester,
} from '../introduction.service';
import { isReplySafe } from '../moderation.service';
import { decodeContactRef, encodeContactRef } from './contactRef';
import { scrubDeep, scrubEmailsDeep, scrubText } from './privacy';
import { getCountryChannels } from '../tools/countryChannels';
import { getNetaiInfo } from '../tools/netaiInfo';
import { optOutFromAsks, resumeAsks, isOptedOutFromAsks } from '../askOptOut.service';
import {
  NOTE_EMPTY_INSIGHT,
  NOTE_EMPTY_SECOND_DEGREE,
  NOTE_EMPTY_TAG,
  NOTE_FUZZY,
  NOTE_INTRO_SENT,
  NOTE_NOT_ON_ALLY,
  NOTE_RATE_LIMITED,
  noteInboxPending,
  noteTooBroad,
  noteTruncated,
} from './texts';

// Above this many total matches the query word is a crowd word — steer the
// model to narrow with the user instead of listing look-alikes (channel-5
// "vague / too-broad" guard from the connector doc).
const TOO_BROAD_TOTAL = 500;

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
  // A technical failure (timeout, SQL error) must never masquerade as "no
  // results" — the model would tell the user the person doesn't exist. Surface
  // it as an error so the model reports a temporary problem and retries.
  if (typeof (outcome as { error?: unknown }).error === 'string') {
    return {
      error:
        'Search failed with a technical error (not an empty result). Tell the user honestly ' +
        'that the search glitched and retry once; do NOT conclude the person is missing.',
    };
  }
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
  else if (typeof total === 'number' && total >= TOO_BROAD_TOTAL)
    payload.note = noteTooBroad(total);
  else if (total > rows.length) payload.note = noteTruncated(rows.length, total);
  return payload;
}

// One paced server-side retry absorbs transient search failures (~3 calls in
// 10 during the 31 Jul battery); shared with the in-app dispatch since the
// thread-7428 finding — see tools/searchRetry.

export async function mcpSearchContacts(
  userId: string,
  args: { tag?: string; name?: string },
): Promise<McpToolPayload> {
  const tag = args.tag?.trim();
  const name = args.name?.trim();
  if (!tag && !name) {
    return { error: 'Pass either tag or name.' };
  }
  const raw = await searchWithRetry(() =>
    tag ? searchByTag(userId, tag) : searchContactByName(userId, name ?? ''),
  );
  return mapSearchResult(userId, raw, NOTE_EMPTY_TAG);
}

export async function mcpSearchByInsight(
  userId: string,
  args: { query: string },
): Promise<McpToolPayload> {
  const insightQuery = args.query?.trim();
  if (!insightQuery) return { error: 'Pass query.' };
  const raw = await searchWithRetry(() => searchByInsight(userId, insightQuery));
  return mapSearchResult(userId, raw, NOTE_EMPTY_INSIGHT);
}

export async function mcpSearchSecondDegree(
  userId: string,
  args: { query: string },
): Promise<McpToolPayload> {
  const searchQuery = args.query?.trim();
  if (!searchQuery) return { error: 'Pass query.' };
  const raw = await searchWithRetry(() => searchSecondDegree(userId, searchQuery));
  return mapSearchResult(userId, raw, NOTE_EMPTY_SECOND_DEGREE);
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
  // Saved contact data masks private emails too (a public web email the model
  // finds itself is fine — this guard is only on the stored-profile read).
  const clean = scrubEmailsDeep(
    scrubDeep({
      tags: profile.tags,
      insights: profile.insights,
      facts_and_ask: profile.facts_and_ask,
    }),
  ) as McpToolPayload;
  return {
    contact_ref: args.contact_ref,
    is_member: profile.is_member,
    // Invite trigger: the user is zooming in on this person — if they're not on
    // Ally, steer toward naming the user's own people who'd open the path.
    ...(profile.is_member === false && { note: NOTE_NOT_ON_ALLY }),
    ...clean,
  };
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
  return {
    contact_ref: args.contact_ref,
    ...(scrubEmailsDeep(scrubDeep(facts)) as McpToolPayload),
  };
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
  // Ask opt-out is a separate store from per-contact blocks — surface both
  // (ticket 6 close, answer 4: the empty block list masked a global opt-out).
  const [blocked, asksOptedOut] = await Promise.all([
    getBlockedByUser(userId),
    isOptedOutFromAsks(Number(userId)),
  ]);
  return {
    blocked: blocked.map((entry) => ({
      name: entry.name,
      contact_ref: encodeContactRef(userId, entry.phone),
    })),
    asks_opted_out: asksOptedOut,
    note: asksOptedOut
      ? 'The user has said "stop contacting me": NO questions from any Netai user reach them, ' +
        'separate from the per-contact blocks above. allow_contacting_me lifts it.'
      : 'Receiving questions is ON (no global opt-out).',
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

interface CountryChannelsRaw {
  found?: boolean;
  error?: string;
  country?: string;
  channels?: { channel: string; count: number; sample: { phone: string; name: string | null }[] }[];
  note?: string;
}

export async function mcpGetCountryChannels(
  userId: string,
  args: { country: string; known_institutions?: string[] },
): Promise<McpToolPayload> {
  const country = (args.country ?? '').trim();
  if (!country) return { error: 'Pass country.' };
  const raw = (await getCountryChannels(
    userId,
    country,
    Array.isArray(args.known_institutions) ? args.known_institutions.map(String) : [],
  )) as CountryChannelsRaw;
  if (raw.found !== true) {
    return { found: false, ...(raw.error && { error: scrubText(raw.error) }) };
  }
  // Phones become contact_refs at the connector boundary, same as every search.
  return {
    found: true,
    country: raw.country,
    channels: (raw.channels ?? []).map((ch) => ({
      channel: ch.channel,
      count: ch.count,
      sample: ch.sample.map((s) => ({
        name: s.name ? scrubText(s.name) : null,
        contact_ref: encodeContactRef(userId, s.phone),
      })),
    })),
    note: raw.note,
  };
}

export async function mcpGetNetaiInfo(args: { topic: string }): Promise<McpToolPayload> {
  return (await getNetaiInfo(args.topic ?? '')) as McpToolPayload;
}

export async function mcpStopContactingMe(
  userId: string,
  args: { reason?: string },
): Promise<McpToolPayload> {
  await optOutFromAsks(userId, args.reason?.trim() || undefined);
  return {
    stopped: true,
    scope: 'all_senders',
    note: 'No more questions will reach them, from anyone. They can lift it at any time.',
  };
}

export async function mcpAllowContactingMe(userId: string): Promise<McpToolPayload> {
  await resumeAsks(userId);
  return { resumed: true };
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

// --- Task-engine + correction tools (connector parity with the in-app set).
// Phones never cross this boundary: contact_ref in, scrubbed payloads out.
// relay_ask stays app-only by design — it exists only inside a live
// incoming-ask thread, which the connector does not have.

const UNKNOWN_TASK_REF = 'Unknown task_ref — take it from get_my_tasks.';
const UNKNOWN_CONTACT_REF =
  'Unknown contact_ref — take it from a fresh search result, never invent it.';

export async function mcpAskContact(
  userId: string,
  args: { task_ref: string; contact_ref: string; question: string },
): Promise<McpToolPayload> {
  const taskId = parseTaskRef(args.task_ref ?? '');
  if (taskId === null) return { sent: false, error: UNKNOWN_TASK_REF };
  const phone = decodeContactRef(userId, args.contact_ref ?? '');
  if (!phone) return { sent: false, error: UNKNOWN_CONTACT_REF };
  const task = await getTaskById(taskId);
  if (!task || String(task.user_id) !== userId || task.status !== 'open') {
    return { sent: false, error: 'Task not found or not open.' };
  }
  const outcome = await createAsk(userId, taskId, phone, args.question ?? '');
  return scrubDeep(outcome) as McpToolPayload;
}

export async function mcpSetTaskBrief(
  userId: string,
  args: { task_ref: string; brief: string },
): Promise<McpToolPayload> {
  const taskId = parseTaskRef(args.task_ref ?? '');
  if (taskId === null) return { updated: false, error: UNKNOWN_TASK_REF };
  const brief = (args.brief ?? '').trim();
  if (!brief) return { updated: false, error: 'Pass a non-empty brief.' };
  return { updated: await setTaskBrief(userId, taskId, brief) };
}

export async function mcpSetTaskWake(
  userId: string,
  args: { task_ref: string; hours: number },
): Promise<McpToolPayload> {
  const taskId = parseTaskRef(args.task_ref ?? '');
  if (taskId === null) return { scheduled: false, error: UNKNOWN_TASK_REF };
  const hours = Math.min(168, Math.max(1, Number(args.hours) || 24));
  return { scheduled: await setTaskWake(userId, taskId, hours), hours };
}

export async function mcpFinishTask(
  userId: string,
  args: { task_ref: string; summary: string },
): Promise<McpToolPayload> {
  const taskId = parseTaskRef(args.task_ref ?? '');
  if (taskId === null) return { closed: false, error: UNKNOWN_TASK_REF };
  const summary = (args.summary ?? 'done').slice(0, 500);
  const closed = await updateTask(userId, taskId, 'closed', summary);
  if (closed) await cancelAsksForTask(taskId);
  return { closed };
}

export async function mcpExcludeContact(
  userId: string,
  args: { contact_ref: string; excluded_for: string; reason: string; revisit_if?: string },
): Promise<McpToolPayload> {
  const phone = decodeContactRef(userId, args.contact_ref ?? '');
  if (!phone) return { saved: false, error: UNKNOWN_CONTACT_REF };
  return saveContactExclusion(
    userId,
    phone,
    args.excluded_for ?? '',
    args.reason ?? '',
    args.revisit_if,
  );
}

export async function mcpRemoveExclusion(
  userId: string,
  args: { contact_ref: string; excluded_for?: string },
): Promise<McpToolPayload> {
  const phone = decodeContactRef(userId, args.contact_ref ?? '');
  if (!phone) return { removed: 0, error: UNKNOWN_CONTACT_REF };
  return removeContactExclusion(userId, phone, args.excluded_for);
}

export async function mcpRetractFact(
  userId: string,
  args: { contact_ref: string; field_type?: string; value_fragment?: string },
): Promise<McpToolPayload> {
  const phone = decodeContactRef(userId, args.contact_ref ?? '');
  if (!phone) return { retracted: 0, error: UNKNOWN_CONTACT_REF };
  return retractOwnFacts(userId, phone, args.field_type, args.value_fragment);
}

export async function mcpMarkContactDeceased(
  userId: string,
  args: { contact_ref: string },
): Promise<McpToolPayload> {
  const phone = decodeContactRef(userId, args.contact_ref ?? '');
  if (!phone) return { marked: false, error: UNKNOWN_CONTACT_REF };
  await markContactDeceased(userId, phone);
  return { marked: true };
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
  // Release first, THEN count — so the just-released burst is already 'seen' and
  // more_pending reflects only what is still waiting.
  const updates = await getPendingUpdates(userId);
  const morePending = await countHeldUpdates(userId);
  return {
    updates: updates.map((u) => ({
      task_ref: u.task_id === null ? null : TASK_REF_PREFIX + String(u.task_id),
      kind: u.kind,
      ...(scrubDeep(u.payload) as McpToolPayload),
    })),
    more_pending: morePending,
  };
}
