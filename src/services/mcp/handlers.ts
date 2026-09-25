import { query } from '../../db/postgres/client';
import { goalsAwaitingTheOwner } from '../taskStore.service';
import {
  recordGoalFeedback,
  queueGoalFeedback,
  GOAL_FEEDBACK_QUESTIONS,
  GoalFeedbackKey,
} from '../goalFeedback.service';
import { searchByTag } from '../tools/searchByTag';
import { searchContactByName } from '../tools/searchContactByName';
import { searchByInsight } from '../tools/searchByInsight';
import { searchSecondDegree } from '../tools/searchSecondDegree';
import { searchWithRetry } from '../tools/searchRetry';
import { logSearchActivity } from '../abuseDetection.service';
import {
  recordSearchOutcome,
  isSearchOutcome,
  SEARCH_OUTCOMES as SEARCH_OUTCOME_VALUES,
} from '../searchOutcome.service';
import { getContactCount } from '../tools/getContactCount';
import { getContactFullProfile, isDisplayableTag } from '../tools/getContactFullProfile';
import { requestIntroduction } from '../tools/requestIntroduction';
import { noteIntroductionSentAsAQuestion } from '../introductionShaped';
import { inviteContact } from '../tools/inviteContact';
import { getInviteLink } from '../referralLink.service';
import { getLabelQueueForUser, getLabelQueueTotalForUser } from '../labelParser.service';
import { respondToIntroduction } from '../tools/respondToIntroduction';
import {
  normalizeFieldType,
  getVisibleFacts,
  submitContactFact,
  FactRefusedError,
  retractOwnFacts,
  hardDeleteOwnFact,
} from '../contactFacts.service';
import {
  createTask,
  findOpenTaskNamedIn,
  getMyTasksPage,
  getTaskById,
  grantTaskPermission,
  isTaskStatus,
  setTaskBrief,
  setTaskWake,
  updateTask,
  Task,
} from '../taskStore.service';
import { cancelAsksForTask, createAsk, getPendingAsksForUser } from '../taskAsks.service';
import { approveTaskPlan, proposeTaskPlan } from '../taskPlans.service';
import { deleteAnswerRule, listAnswerRules } from '../answerRules.service';
import { searchRoster } from '../tools/searchRoster';
import { findWarmPath } from '../tools/findWarmPath';
import { removeContactExclusion, saveContactExclusion } from '../tools/contactExclusions';
import {
  deleteUserNotes,
  getUserNotes,
  isUserNoteKind,
  NOTE_REPLY_RULE,
  NOTE_SCOPE,
  BOUNDARY_SCOPE,
  BOUNDARY_REPLY_RULE,
  saveUserNote,
} from '../userNotes.service';
import {
  countHeldUpdates,
  heldUpdatesWaiting,
  breakdownExcluding,
  HELD_ROWS_READ_LIMIT,
  NOTHING_NAMED,
  getPendingUpdates,
  listSeenUpdates,
  queueResult,
  snoozeUpdate,
  toUpdateRef,
  parseUpdateRef,
  DEFAULT_SNOOZE_DAYS,
  MIN_SNOOZE_DAYS,
  MAX_SNOOZE_DAYS,
} from '../pendingUpdates.service';
import {
  blockContact,
  getBlockedByUser,
  getExcludedPhoneSet,
  unblockContact,
} from '../block.service';
import { normalizePhone } from '../phone';
import { markContactDeceased } from '../deceased.service';
import { ConnectorOutcome, getGroupConnectors, getTopConnectors } from '../graphAnalytics.service';
import { buildCuriosityQueue, maybeCuriosityUpdate } from '../curiosityQueue.service';
import { getUpcomingBirthdays } from '../birthdayLens.service';
import { filterStaleDebriefs, recordDebriefOutcome } from '../debrief.service';
import { answerGoalQuestion } from '../goalQuestions.service';
import {
  saveContactRelationship,
  forgetContactRelationship,
  listOwnRelationships,
} from '../contactRelationships.service';
import { maybeOfferThanksLoop, respondToThanksLoopOffer } from '../thanksLoop.service';
import {
  getPendingRequestsForMediator,
  getRecentResponsesForRequester,
  getIntroStatusForRequester,
} from '../introduction.service';
import { removeContactFromNetwork } from '../tools/removeContactFromNetwork';
import { getNextQuestion, recordAnswer } from '../partH.service';
import { isReplySafe } from '../moderation.service';
import { decodeContactRef, encodeContactRef } from './contactRef';
import { scrubDeep, scrubEmailsDeep, scrubText } from './privacy';
import { getCountryChannels } from '../tools/countryChannels';
import { getNetaiInfo } from '../tools/netaiInfo';
import { recordWarmth } from '../warmth.service';
import { correctContactFact } from '../factCorrections.service';
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
  /** The query asked who somebody is NOT — an honest refusal, not an empty result. */
  readonly negated?: boolean;
  readonly note?: string;
}

function toPublicRow(userId: string, row: SearchRow): McpToolPayload {
  const clean: McpToolPayload = {};
  for (const [key, value] of Object.entries(row)) {
    if (!INTERNAL_ROW_KEYS.has(key)) clean[key] = value;
  }
  const refSource = row.contact_id ?? row.phone;
  // Bridges (search_second_degree.via_contacts) are people too: their number
  // becomes a contact_ref like every other row's, never a raw phone.
  if (Array.isArray(clean.via_contacts)) {
    clean.via_contacts = (clean.via_contacts as { phone?: unknown }[]).map((bridge) => {
      const { phone, ...rest } = bridge;
      return typeof phone === 'string'
        ? { ...rest, contact_ref: encodeContactRef(userId, phone) }
        : rest;
    });
  }
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
 *
 * A row flagged `duplicate_name` (task 54) is the OPPOSITE case — two
 * DIFFERENT registered accounts that happen to share a display name — and
 * must never be collapsed here: task 42 made both Salome accounts render
 * the same registered name, and this same-purpose-but-different-problem
 * dedup started swallowing the second one, silently defeating the very flag
 * built to surface it (ticket 6, 23 Aug: "a flag that says there is another
 * one without returning the other one does not let anyone choose").
 */
function dedupeByName(rows: SearchRow[]): SearchRow[] {
  const seen = new Set<string>();
  const out: SearchRow[] = [];
  for (const row of rows) {
    if (row.duplicate_name === true) {
      out.push(row);
      continue;
    }
    const key = normalizedName(row);
    if (key !== null) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(row);
  }
  return out;
}

// Live-caught (25 Aug): the connector's search tools never called
// logSearchActivity at all — every demand-signal row in search_activity came
// from the in-app surface only, and record_search_outcome (ticket 6, the
// outcome ladder) had no MCP-side search_id to ever reference. tool +
// searchQuery identify what was actually searched, matching the shape
// runLoggedSearch already logs in chat.service.ts. Logging failures are
// caught and logged, never allowed to break the search itself.
async function mapSearchResult(
  userId: string,
  raw: object,
  emptyNote: string,
  tool: string,
  searchQuery: string,
): Promise<McpToolPayload> {
  const outcome = raw as SearchOutcome;
  const resultCount = outcome.total ?? outcome.count ?? outcome.results?.length ?? 0;
  const searchId = await logSearchActivity(userId, tool, searchQuery, resultCount).catch(
    (err: unknown) => {
      // eslint-disable-next-line no-console
      console.error(`[search-log] logSearchActivity failed for user ${userId}:`, err);
      return null;
    },
  );
  const withSearchId = (payload: McpToolPayload): McpToolPayload =>
    searchId === null ? payload : { ...payload, search_id: searchId };

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
  // Pointers ride on BOTH branches: a matchable private fact adds people to a
  // successful search too, not only to an empty one (the founder's third
  // state). Phones become contact_refs, same rule as every result row — and
  // the fact's own text was never in the payload to begin with.
  const pointerCarrier = outcome as {
    pointers?: { contact_id: string; name: string | null; signal_strength: number }[];
    pointer_note?: string;
  };
  const pointerRows = Array.isArray(pointerCarrier.pointers) ? pointerCarrier.pointers : [];
  const pointerPayload =
    pointerRows.length === 0
      ? {}
      : {
          pointers: pointerRows.map((p) => ({
            contact_ref: encodeContactRef(userId, p.contact_id),
            name: p.name,
            signal_strength: p.signal_strength,
          })),
          ...(pointerCarrier.pointer_note !== undefined && {
            pointer_note: pointerCarrier.pointer_note,
          }),
        };

  if (!outcome.found || !Array.isArray(outcome.results) || outcome.results.length === 0) {
    // A NEGATED query is not an empty result (ticket 9 task 14.1): the generic
    // „nothing matched, keep looking" note sends the model back for another
    // word search, which is exactly how the query's own opposite came back as
    // an answer. The search's own explanation wins here.
    const note = outcome.negated === true ? (outcome.note ?? emptyNote) : emptyNote;
    return withSearchId({ found: false, note, ...pointerPayload });
  }
  const deduped = dedupeByName(outcome.results);
  // Real total when the tool reports one; else the deduped pool size.
  const total = outcome.total ?? outcome.count ?? deduped.length;
  const rows = deduped.slice(0, MCP_RESULT_LIMIT).map((row) => toPublicRow(userId, row));
  // The connector redacts a saved email exactly where the in-app path does
  // (ticket 9 task 15.1): the two read paths must not disagree about the same
  // note. A public email the model finds on the web is untouched — this is a
  // stored-contact payload only.
  const payload: McpToolPayload = {
    found: true,
    total,
    results: scrubEmailsDeep(rows) as McpToolPayload[],
    ...pointerPayload,
  };
  // Fuzzy (approximate) matches are flagged so the model treats them as guesses;
  // this takes priority over the truncation note.
  if (outcome.fuzzy) payload.note = NOTE_FUZZY;
  else if (typeof total === 'number' && total >= TOO_BROAD_TOTAL)
    payload.note = noteTooBroad(total);
  else if (total > rows.length) payload.note = noteTruncated(rows.length, total);
  return withSearchId(payload);
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
  return mapSearchResult(userId, raw, NOTE_EMPTY_TAG, tag ? 'tag' : 'name', tag ?? name ?? '');
}

export async function mcpSearchByInsight(
  userId: string,
  args: { query: string },
): Promise<McpToolPayload> {
  const insightQuery = args.query?.trim();
  if (!insightQuery) return { error: 'Pass query.' };
  const raw = await searchWithRetry(() => searchByInsight(userId, insightQuery));
  return mapSearchResult(userId, raw, NOTE_EMPTY_INSIGHT, 'insight', insightQuery);
}

export async function mcpSearchSecondDegree(
  userId: string,
  args: { query: string },
): Promise<McpToolPayload> {
  const searchQuery = args.query?.trim();
  if (!searchQuery) return { error: 'Pass query.' };
  const raw = await searchWithRetry(() => searchSecondDegree(userId, searchQuery));
  return mapSearchResult(userId, raw, NOTE_EMPTY_SECOND_DEGREE, 'second_degree', searchQuery);
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

/**
 * Row 272 on the connector, because the connector can CLOSE a goal
 * (`update_task`) — so a person who finishes one there would otherwise be
 * asked a question they had no way to answer. The registry-parity test caught
 * that the moment the in-app tool existed, which is exactly what it is for.
 */
export async function mcpSaveGoalFeedback(
  userId: string,
  args: { task_ref?: string; question_key?: string; answer?: string },
): Promise<McpToolPayload> {
  const taskId = parseTaskRef(String(args.task_ref ?? ''));
  if (taskId === null) {
    return { success: false, error: 'Unknown task_ref — take it from the goal_feedback item.' };
  }
  const key = String(args.question_key ?? '');
  if (!(GOAL_FEEDBACK_QUESTIONS as readonly string[]).includes(key)) {
    return { success: false, error: 'Unknown question_key — take it from the item.' };
  }
  const saved = await recordGoalFeedback(
    taskId,
    userId,
    key as GoalFeedbackKey,
    String(args.answer ?? ''),
  );
  if (saved === 'empty') {
    return { success: false, error: 'Nothing was said — do not save an empty answer.' };
  }
  await queueGoalFeedback(userId, taskId).catch(() => undefined);
  return { success: true };
}

export async function mcpCheckInbox(userId: string): Promise<McpToolPayload> {
  // The fourth read is the owner's own goals, stuck on the owner — added an
  // hour after the app's, because a fault living in one surface and not the
  // other is the shape this codebase keeps finding. See
  // `goalsAwaitingTheOwner` for what went invisible and why.
  const [pending, answered, pendingAsks, myGoals] = await Promise.all([
    getPendingRequestsForMediator(userId),
    getRecentResponsesForRequester(userId),
    getPendingAsksForUser(userId),
    goalsAwaitingTheOwner(userId),
  ]);
  const payload: McpToolPayload = {
    waiting_for_me: pending.map((request) => ({
      request_ref: REQUEST_REF_PREFIX + String(request.id),
      from: request.requester_name,
      wants_to_meet: request.target_name,
      message: request.message === null ? null : scrubText(request.message),
      created_at: scrubDeep(request.created_at),
      /**
       * The tester's 379: answering one of these writes to a real person, so
       * their seat has never been able to touch `POST /requests/:ref/:action`
       * at all. The payload named the counterpart and never said whether that
       * name belongs to somebody real or to one of the fictional test
       * accounts. **They asked for this and ranked it last themselves**; it
       * is here because an hour was free, not because I re-ranked their list.
       *
       * IT USED TO BE PRESENT ONLY WHEN TRUE, read from a hardcoded Set, and
       * the argument for that was real: a lookup with no I/O has no failure
       * mode, so absence could not mean „unchecked" — the confusion this whole
       * codebase keeps finding. The sentence right there said what would have
       * to change if it ever grew a query: „this field must become an explicit
       * true/false".
       *
       * IT GREW ONE, AND HERE IT IS. The tester can now create seats through
       * `POST /admin/test-accounts`, and a Set in source cannot grow at
       * runtime — it cost a commit per batch, three batches in three hours on
       * 23 September, with the third one blocked waiting on my push. Their own
       * words settled it: a seat the route made is fictional by construction,
       * so the answer is the table the route writes, not a longer list.
       *
       * The read happens INSIDE the query that fetches this request, so it
       * shares that read's fate: if it fails, the inbox fails and the caller
       * sees an error. There is still no state in which „I could not look" is
       * served as „there is nobody there".
       */
      counterpart_is_a_fictional_test_account: request.requester_is_a_test_seat,
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
    // A different flow entirely (task_asks, not introduction_requests) — a
    // question relayed by another member, not a request to meet someone.
    // Live-caught (25 Aug): this category never appeared here at all.
    my_goals_waiting_on_me: myGoals.map((g) => ({
      task_ref: 'task_' + String(g.task_id),
      goal: g.title,
      question: g.question === null ? null : scrubText(g.question),
      waiting_since: scrubDeep(g.waiting_since),
    })),
    questions_for_me: pendingAsks.map((ask) => ({
      ask_id: String(ask.ask_id),
      from: ask.from_name,
      question: scrubText(ask.question),
      created_at: scrubDeep(ask.created_at),
    })),
  };
  if (pending.length > 0 || pendingAsks.length > 0) {
    payload.note = noteInboxPending(pending.length, pendingAsks.length);
  }
  return payload;
}

export async function mcpRespondToRequest(
  userId: string,
  args: {
    request_ref: string;
    accept: boolean;
    response?: string;
    channel?: 'direct' | 'via_mediator';
  },
): Promise<McpToolPayload> {
  const ref = args.request_ref ?? '';
  const requestId = Number(ref.slice(REQUEST_REF_PREFIX.length));
  if (!ref.startsWith(REQUEST_REF_PREFIX) || !Number.isInteger(requestId) || requestId <= 0) {
    return { success: false, error: 'Unknown request_ref — take it from check_my_inbox.' };
  }
  const raw = await respondToIntroduction(
    userId,
    requestId,
    args.accept,
    args.response,
    args.channel,
  );
  return scrubDeep(raw) as McpToolPayload;
}

// Task 17: "did she reply?" answered from system data, never from thread
// text or memory. Missing from the connector until 24 Aug — built in-app,
// never wired here (the same registration gap invite_contact had).
export async function mcpGetIntroStatus(userId: string): Promise<McpToolPayload> {
  const introductions = await getIntroStatusForRequester(userId);
  /**
   * ROW 251 — THE HANDLE CROSSES AS A REF, NEVER AS A NUMBER.
   *
   * The in-app model is given phones and always has been; the connector is
   * not, and „numbers never reach you — stripped" is the promise its own
   * instructions make to it. So the accepted target arrives here the same way
   * every other person does: an opaque ref this account can spend and nobody
   * else can read.
   *
   * Deleting the phone afterwards rather than never selecting it is deliberate
   * — one place decides what an accepted introduction means, and the two
   * surfaces differ only in how the person is named.
   */
  const withRefs = introductions.map(({ target_phone, ...rest }) => ({
    ...rest,
    ...(target_phone ? { contact_ref: encodeContactRef(userId, target_phone) } : {}),
  }));
  return { introductions: withRefs } as unknown as McpToolPayload;
}

// D23 path (1), founder-decided unlink. Same registration gap as above —
// built in-app 22 Aug, never wired into the connector.
export async function mcpRemoveContactFromNetwork(
  userId: string,
  args: { contact_ref: string; confirmed?: boolean },
): Promise<McpToolPayload> {
  const phone = decodeContactRef(userId, args.contact_ref ?? '');
  if (!phone) return { removed: false, error: UNKNOWN_REF_ERROR };
  if (args.confirmed !== true) {
    return {
      removed: false,
      needs_confirmation: true,
      note:
        'Nothing was deleted. Show the user exactly who you would remove and what stays ' +
        '(their notes, the graph bridge through others) — call again with confirmed=true only ' +
        'after their explicit yes.',
    };
  }
  const raw = await removeContactFromNetwork(userId, phone);
  return raw as unknown as McpToolPayload;
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

export async function mcpInviteContact(
  userId: string,
  args: { contact_ref: string; language?: string },
): Promise<McpToolPayload> {
  const phone = decodeContactRef(userId, args.contact_ref ?? '');
  if (!phone) return { success: false, error: UNKNOWN_REF_ERROR };
  const langRaw = String(args.language ?? 'ka');
  const lang = langRaw === 'en' || langRaw === 'ru' || langRaw === 'es' ? langRaw : 'ka';
  return (await inviteContact(userId, phone, lang)) as unknown as McpToolPayload;
}

export async function mcpGetInviteLink(userId: string): Promise<McpToolPayload> {
  return (await getInviteLink(userId)) as unknown as McpToolPayload;
}

const DEFAULT_LABEL_QUEUE_LIMIT = 20;
const MAX_LABEL_QUEUE_LIMIT = 100;

// Ticket 6 (24 Aug): the admin queue view is fine for a human ops route, but
// the assistant surface must carry the same guarantee every other MCP
// payload does — no raw phone number ever crosses this boundary.
export async function mcpGetUnresolvedLabels(
  userId: string,
  args: { limit?: number },
): Promise<McpToolPayload> {
  const rawLimit = Number(args.limit);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LABEL_QUEUE_LIMIT)
      : DEFAULT_LABEL_QUEUE_LIMIT;
  // total (ticket 7 task 12 item 10): a full page with no total read as
  // "exactly that many" — the real queue size travels with every page.
  const [entries, total] = await Promise.all([
    getLabelQueueForUser(userId, limit),
    getLabelQueueTotalForUser(userId),
  ]);
  return {
    entries: entries.map((e) => ({
      contact_ref: encodeContactRef(userId, e.phone),
      alias: e.alias,
    })),
    total,
  };
}

// onboarding rows are reserved for sign-up (ticket 6 task 3, the founder's
// ruling) — same guard as the chat-tool case, not just prompt wording.
export async function mcpGetProfileQuestion(
  userId: string,
  args: { moment?: string; language?: string },
): Promise<McpToolPayload> {
  const requestedMoment = String(args.moment ?? 'any');
  const moment = requestedMoment === 'onboarding' ? 'any' : requestedMoment;
  const language = String(args.language ?? 'ka');
  return (await getNextQuestion(userId, moment, language)) as unknown as McpToolPayload;
}

export async function mcpAnswerProfileQuestion(
  userId: string,
  args: { question_id: string; option_ids?: string[]; free_text?: string; skipped?: boolean },
): Promise<McpToolPayload> {
  const questionId = String(args.question_id ?? '').trim();
  if (!questionId) return { recorded: false, error: 'Pass question_id.' };
  return (await recordAnswer(userId, {
    questionId,
    optionIds: Array.isArray(args.option_ids) ? args.option_ids.map(String) : [],
    freeText: typeof args.free_text === 'string' ? args.free_text : undefined,
    skipped: args.skipped === true,
  })) as unknown as McpToolPayload;
}

export async function mcpSaveContactFact(
  userId: string,
  args: {
    contact_ref: string;
    field_type: string;
    value: string;
    source?: string;
    confidence?: string;
  },
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

  // Only 'debrief' may be claimed by the model; 'sweep' and 'label' are
  // server-side pipelines and stay unreachable from here (fail-closed).
  let result: { is_public: boolean };
  try {
    result = await submitContactFact(
      userId,
      phone,
      fieldType,
      value,
      args.source === 'debrief' ? 'debrief' : 'chat',
      args.confidence === 'mentioned' ? 'mentioned' : 'stated',
    );
  } catch (err) {
    // A guess about a person is refused, not stored (Ticket 11 Task 5 (d)).
    if (err instanceof FactRefusedError) return { saved: false, error: err.message };
    throw err;
  }
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

export async function mcpGetCuriosityQueue(
  userId: string,
  args: { limit?: number },
): Promise<McpToolPayload> {
  const items = await buildCuriosityQueue(userId, args.limit);
  return {
    items: items.map((item) => ({
      contact_ref: encodeContactRef(userId, item.phone),
      label: item.label,
      missing_fact: item.missing_fact,
      question_type: item.question_type,
      priority: item.priority,
    })),
  };
}

// Ticket 10 Task 23 (D121): a fellow member of a named network, reachable past
// the phonebook. Phones become contact_refs before anything is scrubbed.
export async function mcpSearchRoster(
  userId: string,
  args: { group: string; name?: string },
): Promise<McpToolPayload> {
  const outcome = await searchRoster(userId, args.group ?? '', args.name ?? '');
  if (!outcome.found) return scrubDeep(outcome) as McpToolPayload;
  return scrubDeep({
    ...outcome,
    results: outcome.results.map((r) => ({
      ...r,
      contact_ref: encodeContactRef(userId, r.phone),
    })),
  }) as McpToolPayload;
}

export async function mcpFindWarmPath(
  userId: string,
  args: { target_ref: string; max_hops?: number },
): Promise<McpToolPayload> {
  const phone = decodeContactRef(userId, args.target_ref ?? '');
  if (!phone) return { error: UNKNOWN_REF_ERROR };
  const outcome = await findWarmPath(userId, phone, args.max_hops);
  if (!outcome.found) return scrubDeep(outcome) as McpToolPayload;
  return scrubDeep({
    ...outcome,
    target: { ...outcome.target, contact_ref: args.target_ref },
    paths: outcome.paths.map((p) => ({
      ...p,
      bridges: p.bridges.map((b) => ({ ...b, contact_ref: encodeContactRef(userId, b.phone) })),
    })),
  }) as McpToolPayload;
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

export async function mcpGetNetaiInfo(
  userId: string,
  args: { topic: string },
): Promise<McpToolPayload> {
  // The "limits" topic answers about THIS account's budget too (ticket 9 task
  // 17), so the connector must say who is asking.
  return (await getNetaiInfo(args.topic ?? '', userId)) as McpToolPayload;
}

export async function mcpStopContactingMe(
  userId: string,
  args: { confirmed?: boolean; reason?: string },
): Promise<McpToolPayload> {
  // Same gate as the in-app tool: a single-question decline must never become
  // a global opt-out — nothing is written without explicit confirmation.
  if (args.confirmed !== true) {
    return {
      stopped: false,
      needs_confirmation: true,
      note:
        'Nothing was written. A decline of one question is simply their answer — relay it. ' +
        'Call again with confirmed=true only after they explicitly say NO questions from ' +
        'anyone should ever reach them.',
    };
  }
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
/**
 * Row 73. An update had no identifier of its own in any payload, so nothing —
 * a route, a tool or a button — could name which one to postpone. The
 * frontend's „Later" sent no call because there was none to send.
 */

function parseTaskRef(ref: string): number | null {
  if (!ref.startsWith(TASK_REF_PREFIX)) return null;
  const id = Number(ref.slice(TASK_REF_PREFIX.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function mcpCreateTask(
  userId: string,
  args: { title: string; description?: string; task_type?: string; separate?: boolean },
): Promise<McpToolPayload> {
  const title = (args.title ?? '').trim();
  if (!title) return { created: false, error: 'Pass a non-empty title.' };
  /**
   * Row 242 — the third wire, and the one nobody would have found by looking
   * at the evidence, because the seat's pair came through the other two.
   *
   * The connector opens goals with the same tool and the same consequences,
   * and a rule that lives in the chat service is a rule this path never sees.
   * Same check, same escape, asserted by filename in the row's test.
   */
  const alreadyOpen =
    args.separate === true ? null : await findOpenTaskNamedIn(userId, title).catch(() => null);
  if (alreadyOpen !== null) {
    return {
      created: false,
      already_open: {
        task_ref: TASK_REF_PREFIX + String(alreadyOpen.id),
        title: alreadyOpen.title,
        status: alreadyOpen.status,
      },
      next:
        'They already have this goal open. Tell them where it stands rather than opening a ' +
        'second one. If they say it is a DIFFERENT need, call create_task again with ' +
        'separate: true and it will be created.',
    };
  }
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
  const { tasks, total } = await getMyTasksPage(userId, status);
  return {
    // Ticket 16 Task 64: the page size was read as the account's goal count.
    total,
    ...(tasks.length < total && {
      note: `Showing ${tasks.length} of ${total} goals, newest activity first — say so if you name a number.`,
    }),
    tasks: tasks.map((t) => ({
      task_ref: TASK_REF_PREFIX + String(t.id),
      title: scrubText(t.title),
      description: t.description === null ? null : scrubText(t.description),
      type: t.task_type,
      status: t.status,
      // Ticket 17 Task 99: what the ask gate will actually DO, not the raw
      // column. Goal 1619 read `permission_granted: true` beside
      // `plan_approved_at: null` — a legacy August grant with a proposed plan
      // and no yes — and the two were read as a disagreement about whether the
      // yes ever happened. They were not: the gate refuses that goal, because a
      // proposed-and-unapproved plan is the wall too (D119). Now the field says
      // so, and `consent` below says which yes is missing.
      permission_granted: consentStateFor(t) !== 'plan_awaiting_yes' && t.permission_granted,
      // Ticket 16 Task 99: one truth on both screens — the plan's state rides
      // next to the legacy flag, and `consent` says which one is in force.
      plan_version: t.plan_version,
      plan_approved_at: t.plan_approved_at,
      consent: consentStateFor(t),
    })),
  };
}

type ConsentState = 'plan_approved' | 'plan_awaiting_yes' | 'legacy_grant' | 'none';

/**
 * Ticket 20 row 134 — this told every member that every plan was approved.
 *
 * The test was `t.plan !== null && t.plan_approved_at !== null`, and
 * getMyTasks did not SELECT either column. They arrived as undefined, and
 * `undefined !== null` is TRUE — so the first branch matched on every goal in
 * the connector's list. The seat caught it on 3697-3703, where the admin read
 * plan_approved_at null, stage plan_proposed and permission false; it was
 * every goal, on every account, on that path.
 *
 * Two fixes and the second is the one that lasts. The columns are selected
 * now. And the checks below are written so ABSENT data can never produce a
 * yes: a consent state is only claimed from a value that is actually there,
 * and anything missing falls through to the least permissive answer.
 *
 * „I do not know" must never come out as „approved" — the same rule row 147
 * needed an hour ago, where a closed goal with no stored reason read as
 * solved.
 */
export function consentStateFor(
  t: Pick<Task, 'permission_granted' | 'plan' | 'plan_proposed' | 'plan_approved_at'>,
): ConsentState {
  // Truthiness, not `!== null`: undefined is missing data, and missing data is
  // not a yes.
  if (t.plan && t.plan_approved_at) return 'plan_approved';
  if (t.plan_proposed) return 'plan_awaiting_yes';
  return t.permission_granted === true ? 'legacy_grant' : 'none';
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
  // Closing by ANY route cancels what is in flight — a closed goal whose
  // question still sits on someone's phone chases them for nothing (round 1:
  // update_task-closed task 1688 left ask 830 'sent').
  if (ok && args.status === 'closed') await cancelAsksForTask(taskId);
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

// --- The plan (Ticket 10 Task 21, D119). On the connector people are named
// by contact_ref, never by phone; the refs are decoded here, on the server,
// into the phone ids the plan stores and the ask path checks.
interface McpPlanPerson {
  name: string;
  contact_ref: string;
  route: string;
}
interface McpPlanExclusion {
  name: string;
  contact_ref?: string;
}
export interface McpPlanInput {
  solved_when: string;
  routes: { name: string; status?: string }[];
  people_to_involve: McpPlanPerson[];
  never_contact: McpPlanExclusion[];
}

export async function mcpProposeTaskPlan(
  userId: string,
  args: { task_ref: string; plan: McpPlanInput },
): Promise<McpToolPayload> {
  const taskId = parseTaskRef(args.task_ref ?? '');
  if (taskId === null) return { proposed: false, error: UNKNOWN_TASK_REF };
  const plan = args.plan ?? ({} as McpPlanInput);
  const people: { name: string; phone: string; route: string }[] = [];
  for (const p of plan.people_to_involve ?? []) {
    const phone = decodeContactRef(userId, p.contact_ref ?? '');
    if (!phone) return { proposed: false, error: `${p.name}: ${UNKNOWN_CONTACT_REF}` };
    people.push({ name: p.name, phone, route: p.route });
  }
  const never: { name: string; phone?: string }[] = [];
  for (const n of plan.never_contact ?? []) {
    const phone = n.contact_ref ? decodeContactRef(userId, n.contact_ref) : null;
    never.push(phone ? { name: n.name, phone } : { name: n.name });
  }
  const outcome = await proposeTaskPlan(userId, taskId, {
    solved_when: plan.solved_when,
    routes: plan.routes,
    people_to_involve: people,
    never_contact: never,
  });
  return outcome.ok
    ? { proposed: true, version: outcome.value.version, summary: scrubText(outcome.value.summary) }
    : { proposed: false, error: outcome.error };
}

export async function mcpApproveTaskPlan(
  userId: string,
  args: { task_ref: string; confirmed: boolean },
): Promise<McpToolPayload> {
  const taskId = parseTaskRef(args.task_ref ?? '');
  if (taskId === null) return { approved: false, error: UNKNOWN_TASK_REF };
  if (args.confirmed !== true) {
    return {
      approved: false,
      error:
        'Not recorded: the user has not said yes to the plan. Show the summary, ask, and call ' +
        'again with confirmed: true only after their explicit approval.',
    };
  }
  const outcome = await approveTaskPlan(userId, taskId);
  // Day one starts behind the answer (Ticket 12 Tasks 2 and 5) — and ONCE.
  // Row 209: approving a plan that is already in force changes nothing, so a
  // second day one here would only write to the same people a second time.
  if (outcome.ok && !outcome.value.alreadyInForce) {
    void import('../taskEngine.service').then(({ startDayOne }) => startDayOne(taskId));
  }
  return outcome.ok
    ? {
        approved: true,
        version: outcome.value.version,
        summary: scrubText(outcome.value.summary),
        already_approved: outcome.value.alreadyInForce,
      }
    : { approved: false, error: outcome.error };
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
  // T10: threadId omitted deliberately — MCP has no conversation concept, so
  // only the monthly budget gate applies here, not the per-conversation one.
  const question = args.question ?? '';
  const outcome = await createAsk(userId, taskId, phone, question);
  // Row 220: the counter shipped on the chat path alone, and three of the four
  // introductions it was found to have missed came through here.
  if ((outcome as { sent?: unknown }).sent === true) {
    noteIntroductionSentAsAQuestion({ surface: 'connector', taskId }, question);
  }
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
  /**
   * RECORDS ITS OUTCOME NOW. This wrote NULL — the same tool name as the app's
   * `finish_task`, meaning the same thing, and recording nothing — so every
   * goal finished through the connector became part of the 187 closed rows
   * that cannot say whether they worked. Third instance today of one surface
   * knowing something the other does not.
   *
   * AND THE GUARD IS STILL MISSING HERE, which is worth saying rather than
   * hiding behind a tidier column. The app's finish_task refuses unless the
   * owner has actually said the goal is solved — „Not closed: the owner has
   * not said this is solved" — and it refuses often: 15 calls in thirty days,
   * 4 of them allowed through. The connector has no such check, so a
   * `finished` written here is the MODEL's judgement that the work is done,
   * not the owner's word for it. That gap is real and is not closed by this
   * line; it is named so the next reader of the column knows what it can and
   * cannot bear.
   */
  const closed = await updateTask(userId, taskId, 'closed', summary, 'finished');
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
  args: {
    contact_ref: string;
    field_type?: string;
    value_fragment?: string;
    exact_value?: string;
  },
): Promise<McpToolPayload> {
  const phone = decodeContactRef(userId, args.contact_ref ?? '');
  if (!phone) return { retracted: 0, error: UNKNOWN_CONTACT_REF };
  return retractOwnFacts(userId, phone, {
    fieldType: args.field_type,
    valueFragment: args.value_fragment,
    exactValue: args.exact_value,
  });
}

export async function mcpForgetFact(
  userId: string,
  args: {
    contact_ref: string;
    field_type?: string;
    value_fragment?: string;
    confirmed?: boolean;
  },
): Promise<McpToolPayload> {
  const phone = decodeContactRef(userId, args.contact_ref ?? '');
  if (!phone) return { deleted: 0, error: UNKNOWN_CONTACT_REF };
  if (args.confirmed !== true) {
    return {
      deleted: 0,
      needs_confirmation: true,
      note:
        'Nothing was deleted. This is permanent — ask the user to explicitly confirm they ' +
        'want it erased, then call again with confirmed=true.',
    };
  }
  const result = await hardDeleteOwnFact(userId, phone, args.field_type, args.value_fragment);
  return { ...result, needs_confirmation: false };
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
  const note = await saveUserNote(userId, args.kind as 'need' | 'preference' | 'profile', text);
  // `scope` travels with every save: the model writes its confirmation from
  // the RESULT, and a tool description read at the top of the prompt was not
  // enough to stop it promising a boundary nothing keeps.
  //
  // Row 247: a boundary that WAS recorded is a promise the product now keeps,
  // so the pair flips. The decision is taken in saveUserNote, which both
  // surfaces call, rather than twice.
  return note.boundaryTopic === undefined
    ? { saved: true, kind: args.kind, scope: NOTE_SCOPE, reply_rule: NOTE_REPLY_RULE }
    : {
        saved: true,
        kind: args.kind,
        boundary_topic: note.boundaryTopic,
        scope: BOUNDARY_SCOPE,
        reply_rule: BOUNDARY_REPLY_RULE,
      };
}

/**
 * Ticket 19 (the founder's heads-up, 13 Sep): asked in chat to delete one of
 * these notes, the product answered „record deleted" and the note was still
 * there. There was no tool to delete one — only `forget_contact_fact`, which
 * deletes a CONTACT's fact and can never touch a user's own note — so the model
 * reached for the nearest thing and reported success it had not achieved.
 *
 * A note could not even be named here: this handler returned kind and text and
 * dropped the id, so on the connector there was nothing to address. It now
 * carries a `note_ref`, the same shape as `task_ref` — the user's own note, not
 * a third party's anything.
 */
const NOTE_REF_PREFIX = 'note_';

function parseNoteRef(ref: string): number | null {
  if (!ref.startsWith(NOTE_REF_PREFIX)) return null;
  const id = Number(ref.slice(NOTE_REF_PREFIX.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function mcpGetUserNotes(
  userId: string,
  args: { kind?: string },
): Promise<McpToolPayload> {
  const kind = args.kind && isUserNoteKind(args.kind) ? args.kind : undefined;
  const notes = await getUserNotes(userId, kind);
  return {
    notes: notes.map((n) => ({
      note_ref: NOTE_REF_PREFIX + String(n.id),
      kind: n.kind,
      text: scrubText(n.text),
    })),
  };
}

export async function mcpForgetUserNote(
  userId: string,
  args: { note_ref: string },
): Promise<McpToolPayload> {
  const id = parseNoteRef(args.note_ref ?? '');
  if (id === null) {
    return { deleted: false, error: 'Unknown note_ref — take it from get_user_notes.' };
  }
  // deleteUserNotes is scoped to the caller, so another account's note is a
  // no-op here rather than a deletion.
  const { deleted } = await deleteUserNotes(userId, [id]);
  return deleted > 0
    ? { deleted: true, count: deleted }
    : {
        deleted: false,
        error:
          "Nothing was deleted — that note is not there, or it is not this user's. Do NOT tell " +
          'them it is gone: read get_user_notes again and say what you actually see.',
      };
}

// The user's standing answer rules (Ticket 10 Task 22): theirs to see and delete.
export async function mcpListAnswerRules(userId: string): Promise<McpToolPayload> {
  const rules = await listAnswerRules(userId);
  return {
    rules: rules.map((r) => ({
      rule_id: r.id,
      kind: scrubText(r.kind),
      answer: scrubText(r.answer),
      uses: r.uses,
      created_at: r.created_at,
    })),
  };
}

export async function mcpDeleteAnswerRule(
  userId: string,
  args: { rule_id: number },
): Promise<McpToolPayload> {
  const ruleId = Number(args.rule_id);
  if (!Number.isInteger(ruleId) || ruleId <= 0) return { deleted: false, error: 'Pass rule_id.' };
  return { deleted: await deleteAnswerRule(userId, ruleId) };
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

export async function mcpRecordSearchOutcome(
  userId: string,
  args: { search_id?: number; outcome?: string; reason?: string; worked?: boolean },
): Promise<McpToolPayload> {
  const searchId = Number(args.search_id);
  if (!Number.isFinite(searchId) || searchId <= 0) {
    return { recorded: false, error: 'search_id must be a real id from a search result.' };
  }
  const outcome = args.outcome ?? '';
  if (!isSearchOutcome(outcome)) {
    return {
      recorded: false,
      error: `outcome must be one of: ${SEARCH_OUTCOME_VALUES.join(', ')}.`,
    };
  }
  const recorded = await recordSearchOutcome({
    searchId,
    userId,
    outcome,
    reason: args.reason ?? null,
    worked: typeof args.worked === 'boolean' ? args.worked : null,
  });
  if (!recorded) {
    return {
      recorded: false,
      error: "That search_id is not one of this conversation's own searches.",
    };
  }
  const thanksLoopOffer = await maybeOfferThanksLoop(userId, outcome);
  return {
    recorded: true,
    ...(thanksLoopOffer && {
      thanks_loop_offer: true,
      note:
        'This user was invited to Netai and just got their first real result. Ask, once, if they ' +
        'would like to thank whoever invited them, as a short yes/no question. Then call ' +
        'respond_to_thanks_loop_offer with their answer.',
    }),
  };
}

export async function mcpRespondToThanksLoopOffer(
  userId: string,
  args: { consented?: boolean },
): Promise<McpToolPayload> {
  return { ...(await respondToThanksLoopOffer(userId, args.consented === true)) };
}

export async function mcpGetPendingUpdates(
  userId: string,
  args: { include_seen?: boolean } = {},
): Promise<McpToolPayload> {
  // Release first, THEN count — so the just-released burst is already 'seen' and
  // more_pending reflects only what is still waiting. Same unified T9 surface
  // as the in-app read: stale debriefs dropped (D49 "with no outcome
  // recorded"), at most one live curiosity item appended.
  const updates = await filterStaleDebriefs(userId, await getPendingUpdates(userId));
  const morePending = await countHeldUpdates(userId);
  /**
   * Row 250 and the founder's „skip, don't repeat" on the same line — BOTH
   * surfaces, because that was the whole lesson of the inbox row: a tool that
   * is right in one reader and silent in the other is a fault, not a fix.
   *
   * The in-app chat writes this line itself and can strike out what it has
   * already named by id. Here the model writes it, so it gets the same
   * breakdown and the rule that goes with it, in the tool's own description.
   * Best-effort: a breakdown that cannot be read leaves the count alone.
   */
  const heldByKind =
    morePending > 0
      ? await heldUpdatesWaiting(userId)
          .then((rows) =>
            rows.length > HELD_ROWS_READ_LIMIT
              ? null
              : breakdownExcluding(rows, NOTHING_NAMED).by_kind,
          )
          .catch((error: unknown) => {
            // eslint-disable-next-line no-console
            console.error('[pending] could not read what is held:', (error as Error).message);
            return null;
          })
      : null;
  // Ticket 12 Task 32: on request, the rows already shown in earlier
  // conversations ride along under their own key — read, never re-released.
  const alreadyShown =
    args.include_seen === true
      ? (await listSeenUpdates(userId)).map((u) => ({
          task_ref: u.task_id === null ? null : TASK_REF_PREFIX + String(u.task_id),
          kind: u.kind,
          ...(scrubDeep(u.payload) as McpToolPayload),
        }))
      : null;
  const curiosity = await maybeCuriosityUpdate(userId).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[curiosity] pending-update check failed:', (err as Error).message);
    return null;
  });
  const items = [
    ...updates.map((u) => ({
      update_ref: toUpdateRef(u.id),
      task_ref: u.task_id === null ? null : TASK_REF_PREFIX + String(u.task_id),
      kind: u.kind,
      ...(scrubDeep(u.payload) as McpToolPayload),
    })),
    ...(curiosity === null
      ? []
      : [
          {
            task_ref: null,
            kind: curiosity.kind,
            contact_ref: encodeContactRef(userId, curiosity.phone),
            ...(scrubDeep(curiosity.payload) as McpToolPayload),
          },
        ]),
  ];
  return {
    updates: items,
    more_pending: morePending,
    ...(heldByKind !== null && { more_pending_by_kind: heldByKind }),
    ...(alreadyShown !== null && { already_shown: alreadyShown }),
  };
}

/**
 * Row 73 — „Later" gives an update back instead of spending it.
 *
 * A non-sticky update is flipped to 'seen' the moment it is shown, because
 * most updates are news and news is reported once. This takes one back:
 * 'held' again, released when the person asked for it. Nothing is lost and
 * nothing is repeated a minute later.
 *
 * The refusal is explicit. An id that is not this user's, or does not exist,
 * comes back as a plain false — never as a cheerful confirmation of a
 * postponement that did not happen.
 */
export async function mcpSnoozeUpdate(
  userId: string,
  args: { update_ref?: string; days?: number },
): Promise<McpToolPayload> {
  const ref = args.update_ref ?? '';
  const id = parseUpdateRef(ref);
  if (id === null) {
    return { success: false, error: 'Unknown update_ref — take it from get_pending_updates.' };
  }
  const days = typeof args.days === 'number' ? args.days : DEFAULT_SNOOZE_DAYS;
  const moved = await snoozeUpdate(userId, id, days);
  if (!moved) {
    return { success: false, error: 'That update is not yours or no longer exists.' };
  }
  const clamped = Math.min(MAX_SNOOZE_DAYS, Math.max(MIN_SNOOZE_DAYS, Math.trunc(days)));
  return { success: true, update_ref: ref, coming_back_in_days: clamped };
}

export async function mcpCorrectContactFact(
  userId: string,
  args: { contact_ref?: string; wrong_value?: string; field_type?: string },
): Promise<McpToolPayload> {
  const phone = decodeContactRef(userId, args.contact_ref ?? '');
  if (!phone) return { corrected: false, error: UNKNOWN_REF_ERROR };
  const outcome = await correctContactFact(userId, phone, args.wrong_value ?? '', args.field_type);
  return outcome.corrected
    ? {
        ...outcome,
        note: "Recorded. This person will no longer be returned to this user for that claim; nobody else's record changed.",
      }
    : { ...outcome };
}

export async function mcpSaveCloseContact(
  userId: string,
  args: { contact_ref?: string; could_use_netai?: boolean },
): Promise<McpToolPayload> {
  const phone = decodeContactRef(userId, args.contact_ref ?? '');
  if (!phone) return { saved: false, error: UNKNOWN_REF_ERROR };
  await recordWarmth(userId, phone, 'stated_close', 'connector');
  return {
    saved: true,
    could_use_netai: args.could_use_netai === true,
    note: 'Recorded quietly. It only shapes who Netai suggests and who it would ever ask this user to invite — never read it back as a fact about them.',
  };
}

export async function mcpSaveContactRelationship(
  userId: string,
  args: { contact_ref_a?: string; contact_ref_b?: string; relation?: string },
): Promise<McpToolPayload> {
  const phoneA = decodeContactRef(userId, args.contact_ref_a ?? '');
  const phoneB = decodeContactRef(userId, args.contact_ref_b ?? '');
  if (!phoneA || !phoneB) return { saved: false, error: UNKNOWN_REF_ERROR };
  return { ...(await saveContactRelationship(userId, phoneA, phoneB, args.relation ?? '')) };
}

export async function mcpForgetContactRelationship(
  userId: string,
  args: { contact_ref_a?: string; contact_ref_b?: string; relation?: string },
): Promise<McpToolPayload> {
  const phoneA = decodeContactRef(userId, args.contact_ref_a ?? '');
  const phoneB = decodeContactRef(userId, args.contact_ref_b ?? '');
  if (!phoneA || !phoneB) return { removed: 0, error: UNKNOWN_REF_ERROR };
  return { ...(await forgetContactRelationship(userId, phoneA, phoneB, args.relation)) };
}

export async function mcpGetContactRelationships(
  userId: string,
  args: { contact_ref?: string },
): Promise<McpToolPayload> {
  const phone = args.contact_ref ? decodeContactRef(userId, args.contact_ref) : undefined;
  if (args.contact_ref && !phone) return { relationships: [], error: UNKNOWN_REF_ERROR };
  const rows = await listOwnRelationships(userId, phone ?? undefined);
  // The owner reads their own records back — but phones still never cross
  // the connector boundary: each side becomes a contact_ref.
  return {
    relationships: rows.map((r) => ({
      contact_ref_a: encodeContactRef(userId, r.phone_a),
      contact_ref_b: encodeContactRef(userId, r.phone_b),
      relation: r.relation,
    })),
  };
}

export async function mcpAnswerGoalQuestion(
  userId: string,
  args: { task_id?: number; answer?: string },
): Promise<McpToolPayload> {
  return {
    ...(await answerGoalQuestion(userId, Number(args.task_id), String(args.answer ?? ''))),
  };
}

export async function mcpRecordDebriefOutcome(
  userId: string,
  args: { subject?: string; ref_id?: number; worked?: boolean; not_yet?: boolean },
): Promise<McpToolPayload> {
  const subject = args.subject;
  if (subject !== 'introduction' && subject !== 'relayed_ask' && subject !== 'search') {
    return { recorded: false, error: 'subject must be "introduction", "relayed_ask" or "search".' };
  }
  return {
    ...(await recordDebriefOutcome(
      userId,
      subject,
      Number(args.ref_id),
      args.worked === true,
      args.not_yet === true,
    )),
  };
}

/**
 * The birthday lens (D1). Contact ids are encoded like every other read path —
 * a raw phone never leaves this boundary.
 */
export async function mcpGetUpcomingBirthdays(
  userId: string,
  args: { days?: number },
): Promise<McpToolPayload> {
  const rows = await getUpcomingBirthdays(userId, args.days ?? 30);
  return {
    birthdays: rows.map((b) => ({
      contact_ref: encodeContactRef(userId, b.contact_id),
      name: b.name,
      saved_as: b.saved_as,
      days_until: b.days_until,
    })),
    note:
      'A warm surface only. Never use a birthday in matching, ranking, targeting or as an ' +
      'argument for an introduction.',
  };
}
