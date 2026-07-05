import { query } from '../../db/postgres/client';
import { searchByTag } from '../tools/searchByTag';
import { searchContactByName } from '../tools/searchContactByName';
import { searchByInsight } from '../tools/searchByInsight';
import { searchSecondDegree } from '../tools/searchSecondDegree';
import { getContactCount } from '../tools/getContactCount';
import { getContactFullProfile, isDisplayableTag } from '../tools/getContactFullProfile';
import { requestIntroduction } from '../tools/requestIntroduction';
import { respondToIntroduction } from '../tools/respondToIntroduction';
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
  if (total > rows.length) payload.note = noteTruncated(rows.length, total);
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
  const profile = await getContactFullProfile(userId, phone);
  const clean = scrubDeep({
    tags: profile.tags,
    insights: profile.insights,
    facts_and_ask: profile.facts_and_ask,
  }) as McpToolPayload;
  return { contact_ref: args.contact_ref, ...clean };
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
  args: { mediator_name: string; target_name: string; message: string; mediator_ref?: string },
): Promise<McpToolPayload> {
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
      about: reply.target_name,
      status: reply.status,
      note_from_mediator:
        reply.mediator_response === null ? null : scrubText(reply.mediator_response),
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
