import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import {
  authenticateJwt,
  requireUserRole,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import {
  getPendingUpdates,
  listSeenUpdates,
  listHeldUpdates,
  bringUpdateBackNow,
  countHeldUpdates,
  countUpdatesForBadge,
  peekDueUpdates,
  pastWeeklySummaries,
  latestUpdates,
  LATEST_UPDATES_LIMIT,
  LatestUpdate,
  UpdateCounts,
  snoozeUpdate,
  markUpdateSeen,
  toUpdateRef,
  parseUpdateRef,
  PendingUpdate,
  MIN_SNOOZE_DAYS,
  MAX_SNOOZE_DAYS,
  DEFAULT_SNOOZE_DAYS,
} from '../../services/pendingUpdates.service';
import {
  answersForAsks,
  CaseRef,
  caseRefsFor,
  goalTitlesFor,
} from '../../services/pendingUpdates.service';
import {
  answeredDetail,
  cardHeading,
  debriefAskId,
  normalisedPayload,
  storyLine,
} from '../../services/updateCard';
import { userLanguage } from '../../services/threads.service';
import {
  ANSWER_KIND,
  answerLine,
  INTRO_ANSWER_KIND,
  introAnswerLine,
  introAnswerRef,
  LatestIntroAnswer,
  latestIntroAnswers,
  answerRef,
  latestAnswers,
  type LatestAnswer,
} from '../../services/latestAnswers.service';
import {
  countFollowedUpdates,
  listFollowedUpdates,
  setUpdateFollowed,
} from '../../services/followUp.service';
import { asRunLanguage, type RunLanguage } from '../../services/runLanguage';
import { ApiResponse } from '../../types';

/**
 * Row 73 — the updates screen's half that is mine.
 *
 * The frontend checked rather than assumed and said there is no such screen in
 * their code at all: nothing reads an `update_ref`, nothing draws an update as
 * its own row. So they told me not to build the route, and they were right —
 * their words, and mine first, on item 5: „a route nobody calls is exactly the
 * guard that stands on the wrong path."
 *
 * Misho's answer on 21 September to „should the screen be built": **აშენდეს.**
 * So this is the half that has to exist BEFORE theirs can: the list the screen
 * reads, and the postponement it writes.
 *
 * THE IDENTIFIER IS THE SAME ONE THE CONNECTOR HANDS OUT, imported rather
 * than respelled. `POST /requests/:ref/:action` takes a UUID while
 * `check_my_inbox` returns `req_<id>` — two identifiers under one name, a 400
 * when either is fed to the other, and the tester's seat blocked on it since
 * the beginning. Doing that twice would be a choice.
 *
 * WHAT IT DELIBERATELY IS NOT: a way to read an update without it counting as
 * read. `getPendingUpdates` marks what it releases as seen, exactly as the
 * assistant's own call does — which is the fault row 73 turned out to be about
 * (a row marked seen on display, so „later" was not late, it was impossible).
 * A screen that showed updates without spending them would be a second,
 * quieter version of the same bug.
 */
const updatesRouter = Router();

updatesRouter.use(authenticateJwt, requireUserRole);
updatesRouter.use(rateLimit({ windowMs: 60_000, max: 30 }));

interface UpdateRow {
  readonly update_ref: string;
  readonly kind: string;
  readonly payload: unknown;
  readonly task_id: number | null;
  /**
   * ROW 73 — what the card says before anybody taps it. Always present,
   * whatever the kind, so one renderer can draw all ten.
   */
  readonly title: string;
  readonly detail: string;
  /** Row 230: a debrief whose question has since been answered. */
  readonly answered: boolean;
  /** #2080: the person flagged it to come back to; it stays on top until cleared. */
  readonly followed: boolean;
  /** #6769: the case this belongs to — its conversation (tap opens it) and short title. */
  readonly thread_id: number | null;
  readonly case_title: string | null;
}

/**
 * ⚠️ THE PAYLOAD IS STILL SENT WHOLE. `title` and `detail` are ADDED beside
 * it, never instead of it: the app reads fields out of the payload today and
 * replacing it would break their screen to fix their screen. Nothing existing
 * moves; there is simply now a pair of fields that every card has.
 */
function updatePayload(
  u: PendingUpdate,
  titles: ReadonlyMap<number, string>,
  answers: ReadonlyMap<number, string>,
  language: RunLanguage,
  followedIds: ReadonlySet<number>,
  cases: ReadonlyMap<number, CaseRef> = new Map(),
): UpdateRow {
  const caseRef = u.task_id === null ? undefined : cases.get(u.task_id);
  const payload = normalisedPayload(u.kind, u.payload);
  const heading = cardHeading(
    u.kind,
    payload,
    u.task_id === null ? null : (titles.get(u.task_id) ?? null),
    language,
  );
  // Row 230: once the person answered, the card says so, with the answer.
  const askId = debriefAskId(u.kind, payload);
  const answer = askId === null ? undefined : answers.get(askId);
  const who = typeof payload.who === 'string' ? payload.who : '';
  return {
    update_ref: toUpdateRef(u.id),
    kind: u.kind,
    payload,
    task_id: u.task_id ?? null,
    title: heading.title,
    detail:
      answer !== undefined && who !== '' ? answeredDetail(who, answer, language) : heading.detail,
    answered: answer !== undefined,
    followed: followedIds.has(u.id),
    thread_id: caseRef?.threadId ?? null,
    case_title: caseRef?.caseTitle ?? null,
  };
}

interface UpdatesView {
  readonly due: readonly UpdateRow[];
  /** #2080: flagged cards, kept out of `seen` and drawn on top. */
  readonly followed: readonly UpdateRow[];
  readonly seen: readonly UpdateRow[];
  readonly held: number;
}

/**
 * What the screen draws: what is due now, what was already shown (so a reload
 * is not a blank page — the third part of row 73), and how many are still
 * being held back.
 *
 * `due` is read FIRST and `held` after it, because releasing marks rows seen
 * and the two counts have to agree on the same moment.
 *
 * ⚠️ WHICH IS ALSO WHY `seen` HAS TO SUBTRACT `due`, and the tester found it:
 * a snoozed row came back due and appeared in BOTH lists of the same reply.
 * Not a snooze bug — releasing marks a row seen, so by the time `seen` is read
 * every row just released is in it, and this has been true of every due row
 * since the endpoint was written. A screen that draws both lists draws each
 * new card twice.
 *
 * The rows stay in `seen` on the NEXT read, which is what `seen` is for: a
 * reload is not a blank page. It is only this reply, where they are already
 * being shown as due, that they are not also history.
 */
/** The first due updates, one line each, in the reader's language — read without spending them. */
async function storyLines(userId: string, chosen: RunLanguage | null): Promise<string[]> {
  const [due, lang] = await Promise.all([
    peekDueUpdates(userId),
    chosen !== null ? Promise.resolve(chosen) : userLanguage(userId),
  ]);
  const titles = await goalTitlesFor(due.map((u) => u.task_id));
  return due.map((u) =>
    storyLine(
      cardHeading(
        u.kind,
        normalisedPayload(u.kind, u.payload),
        u.task_id === null ? null : (titles.get(u.task_id) ?? null),
        lang,
      ),
    ),
  );
}

interface CountView extends UpdateCounts {
  readonly followed: number;
  /** The frontend's 06:30Z item 5: at most three lines for the home card; spends nothing. */
  readonly lines: readonly string[];
}

// #387, the frontend's ask (3 October): a read-only count for a sidebar badge.
// GET / releases and marks what it returns, so it cannot be asked „how many";
// this spends nothing.  GET /updates/count → { due, held, followed, lines }
updatesRouter.get(
  '/count',
  async (req: Request, res: Response<ApiResponse<CountView>>): Promise<void> => {
    const userId = String((req as AuthenticatedRequest).user.userId);
    try {
      const [counts, followed, lines] = await Promise.all([
        countUpdatesForBadge(userId),
        countFollowedUpdates(userId),
        // The same language rule as GET / (X-Locale first, then the inferred one).
        storyLines(userId, asRunLanguage(req.get('X-Locale'))),
      ]);
      res.status(200).json({ success: true, data: { ...counts, followed, lines } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[GET /updates/count]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

interface LatestRowView {
  readonly update_ref: string;
  readonly kind: string;
  readonly task_id: number | null;
  /** The case's conversation — the row opens it; null for an update with no goal. */
  readonly thread_id: number | null;
  /** #5215: the case's short title, to group rows of one case under; null when there is none. */
  readonly case_title: string | null;
  readonly title: string;
  readonly detail: string;
  /** One short line: the case and what happened. */
  readonly line: string;
  /** When it came out (ISO). */
  readonly released_at: string;
}

/** The newest updates as the home card's rows, in the reader's language. */
async function latestRows(
  userId: string,
  chosen: RunLanguage | null,
): Promise<readonly LatestRowView[]> {
  const [rows, answers, introAnswers, language] = await Promise.all([
    latestUpdates(userId),
    latestAnswers(userId, LATEST_UPDATES_LIMIT),
    latestIntroAnswers(userId, LATEST_UPDATES_LIMIT),
    chosen !== null ? Promise.resolve(chosen) : userLanguage(userId),
  ]);
  const titles = await goalTitlesFor([
    ...rows.map((u) => u.task_id),
    ...answers.map((a) => a.task_id),
    ...introAnswers.map((a) => a.task_id),
  ]);
  const updateRows = rows.map((u: LatestUpdate) => {
    const heading = cardHeading(
      u.kind,
      normalisedPayload(u.kind, u.payload),
      u.task_id === null ? null : (titles.get(u.task_id) ?? null),
      language,
    );
    return {
      update_ref: toUpdateRef(u.id),
      kind: u.kind,
      task_id: u.task_id ?? null,
      thread_id: u.thread_id ?? null,
      case_title: u.case_title?.trim() || null,
      title: heading.title,
      detail: heading.detail,
      line: storyLine(heading),
      released_at: new Date(u.released_at).toISOString(),
    };
  });
  return newestFirst([
    ...updateRows,
    ...answers.map((a) => answerRow(a, titles, language)),
    ...introAnswers.map((a) => introAnswerRow(a, titles, language)),
  ]);
}

/** G-155 (#6344 in #6768): an answer to the owner's introduction request, as a home card row. */
function introAnswerRow(
  answer: LatestIntroAnswer,
  titles: ReadonlyMap<number, string>,
  language: RunLanguage,
): LatestRowView {
  const detail = introAnswerLine(answer, language);
  const title =
    (answer.task_id === null ? undefined : titles.get(answer.task_id)) ??
    answer.case_title?.trim() ??
    '';
  return {
    update_ref: introAnswerRef(answer.request_id),
    kind: INTRO_ANSWER_KIND,
    task_id: answer.task_id,
    thread_id: answer.thread_id,
    case_title: answer.case_title?.trim() || null,
    title,
    detail,
    line: storyLine({ title, detail }),
    released_at: new Date(answer.answered_at).toISOString(),
  };
}

/** #6344: an answer to the owner's question, as a home card row. */
function answerRow(
  answer: LatestAnswer,
  titles: ReadonlyMap<number, string>,
  language: RunLanguage,
): LatestRowView {
  const detail = answerLine(answer, language);
  const title = titles.get(answer.task_id) ?? answer.case_title?.trim() ?? '';
  return {
    update_ref: answerRef(answer.ask_id),
    kind: ANSWER_KIND,
    task_id: answer.task_id,
    thread_id: answer.thread_id,
    case_title: answer.case_title?.trim() || null,
    title,
    detail,
    line: storyLine({ title, detail }),
    released_at: new Date(answer.answered_at).toISOString(),
  };
}

function newestFirst(rows: readonly LatestRowView[]): readonly LatestRowView[] {
  return [...rows]
    .sort((a, b) => b.released_at.localeCompare(a.released_at))
    .slice(0, LATEST_UPDATES_LIMIT);
}

/**
 * #5121 (Giorgi, 15 Oct): the home card „ბოლო სიახლეები" — the three newest
 * updates, newest first, one line each, each opening its case.
 *   GET /updates/latest → { updates: [LatestRowView] }
 * Read-only: nothing is released or marked seen.
 */
updatesRouter.get(
  '/latest',
  async (
    req: Request,
    res: Response<ApiResponse<{ readonly updates: readonly LatestRowView[] }>>,
  ): Promise<void> => {
    const userId = String((req as AuthenticatedRequest).user.userId);
    try {
      const updates = await latestRows(userId, asRunLanguage(req.get('X-Locale')));
      res.status(200).json({ success: true, data: { updates } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[GET /updates/latest]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

interface HeldRowView {
  readonly update_ref: string;
  readonly title: string;
  readonly detail: string;
  /** When it becomes due again (ISO). */
  readonly until: string;
}

/**
 * The frontend's 13 Oct ask (FIXED2 „later" list):
 *   GET /updates/held → { held: [{ update_ref, title, detail, until }] }, soonest first.
 * Spends nothing, like /count: the „later" list is not a reading of the due cards.
 */
updatesRouter.get(
  '/held',
  async (
    req: Request,
    res: Response<ApiResponse<{ readonly held: readonly HeldRowView[] }>>,
  ): Promise<void> => {
    const userId = String((req as AuthenticatedRequest).user.userId);
    try {
      const chosen = asRunLanguage(req.get('X-Locale'));
      const [rows, language] = await Promise.all([
        listHeldUpdates(userId),
        chosen !== null ? Promise.resolve(chosen) : userLanguage(userId),
      ]);
      const titles = await goalTitlesFor(rows.map((u) => u.task_id));
      const held = rows.map((u) => {
        const heading = cardHeading(
          u.kind,
          normalisedPayload(u.kind, u.payload),
          u.task_id === null ? null : (titles.get(u.task_id) ?? null),
          language,
        );
        return {
          update_ref: toUpdateRef(u.id),
          title: heading.title,
          detail: heading.detail,
          until: new Date(u.release_at).toISOString(),
        };
      });
      res.status(200).json({ success: true, data: { held } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[GET /updates/held]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

/**
 * 4296 (plate NEW-5): GET /updates/weekly-summaries → { summaries: [UpdateRow] },
 * newest first — last week's summary opened again, word for word. Spends nothing.
 */
updatesRouter.get(
  '/weekly-summaries',
  async (
    req: Request,
    res: Response<ApiResponse<{ readonly summaries: readonly UpdateRow[] }>>,
  ): Promise<void> => {
    const userId = String((req as AuthenticatedRequest).user.userId);
    try {
      const chosen = asRunLanguage(req.get('X-Locale'));
      const [rows, language] = await Promise.all([
        pastWeeklySummaries(userId),
        chosen !== null ? Promise.resolve(chosen) : userLanguage(userId),
      ]);
      const none = new Map<number, string>();
      res.status(200).json({
        success: true,
        data: { summaries: rows.map((u) => updatePayload(u, none, none, language, new Set())) },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[GET /updates/weekly-summaries]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

updatesRouter.get('/', async (req: Request, res: Response<ApiResponse<UpdatesView>>) => {
  const userId = String((req as AuthenticatedRequest).user.userId);
  try {
    const due = await getPendingUpdates(userId);
    const [seen, held, flagged] = await Promise.all([
      listSeenUpdates(userId),
      countHeldUpdates(userId),
      listFollowedUpdates(userId),
    ]);
    const dueNow = new Set(due.map((u) => u.id));
    const followedIds = new Set(flagged.map((u) => u.id));
    // #2080: a flagged card is never in the read list; it rides in its own.
    const shown = seen.filter((u) => !dueNow.has(u.id) && !followedIds.has(u.id));
    const followedShown = flagged.filter((u) => !dueNow.has(u.id));
    /**
     * The goals' own titles and the reader's own language, both fetched once
     * for the whole screen rather than per card — and both best-effort: a
     * heading is worth having in a fallback language, and no heading at all is
     * what row 73 is about.
     */
    /**
     * ⚠️ THE LANGUAGE THEY CHOSE BEATS THE ONE WE INFER — and only when they
     * chose one.
     *
     * `detail` is written here for every kind, while the screen around it is
     * drawn by the app. Ours followed the person's own writing, theirs follows
     * the profile setting, so for anybody whose two disagree EVERY card split
     * down the middle: their chrome English, our line Georgian. Both answers
     * were right, which is why it would never have been filed as a bug — it
     * would just have looked strange for ever.
     *
     * `X-Locale` arrives only when a choice exists (frontend build 1953859).
     * Missing means „nobody has said", NOT English, so the fallback is the
     * inference we already had — see `asRunLanguage`.
     */
    const chosen = asRunLanguage(req.get('X-Locale'));
    const askIds = [...due, ...followedShown, ...shown]
      .map((u) => debriefAskId(u.kind, normalisedPayload(u.kind, u.payload)))
      .filter((id): id is number => id !== null);
    const taskIds = [...due, ...followedShown, ...shown].map((u) => u.task_id);
    const [titles, cases, answers, language] = await Promise.all([
      goalTitlesFor(taskIds).catch(() => new Map<number, string>()),
      caseRefsFor(taskIds).catch(() => new Map<number, CaseRef>()),
      answersForAsks(askIds).catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[updates] answers read failed:', (err as Error).message);
        return new Map<number, string>();
      }),
      chosen !== null
        ? Promise.resolve(chosen)
        : userLanguage(userId).catch(() => 'ka' as RunLanguage),
    ]);
    res.status(200).json({
      success: true,
      data: {
        // #6369: newest first, as the read list is; the due read picks the oldest few, oldest first.
        due: [...due]
          .reverse()
          .map((u) => updatePayload(u, titles, answers, language, followedIds, cases)),
        followed: followedShown.map((u) =>
          updatePayload(u, titles, answers, language, followedIds, cases),
        ),
        seen: shown.map((u) => updatePayload(u, titles, answers, language, followedIds, cases)),
        held,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[updates] list failed:', error);
    res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
  }
});

/**
 * ROW 230 (D462) — „I have read it", which is the only thing that spends the
 * weekly summary card.
 *
 * The founder's second answer: „the card must NOT be spent by merely opening
 * the screen." `getPendingUpdates` now releases a `weekly_summary` and leaves
 * it held, so the card survives somebody opening the page and walking past it.
 * This is the tap.
 *
 * WHY IT IS A ROUTE AND NOT A FLAG ON THE FRONTEND'S SIDE. They had already
 * made the card survive, by looking in `due` and `seen` both — and then told
 * me, unprompted, that the record still said „seen" when nobody had read it.
 * A screen that looks right over a row that says something untrue is the exact
 * fault this whole week has been about, and they were right to refuse to leave
 * it there.
 */
updatesRouter.post(
  '/:ref/seen',
  param('ref').isString().trim().notEmpty(),
  async (req: Request, res: Response<ApiResponse<{ update_ref: string }>>) => {
    const ref = String(req.params.ref);
    const id = parseUpdateRef(ref);
    if (id === null) {
      res.status(400).json({
        success: false,
        error: 'Unknown update_ref — take it from GET /updates.',
      });
      return;
    }
    const userId = String((req as AuthenticatedRequest).user.userId);
    try {
      // Another account's row is a no-op, not a write — and 404 rather than a
      // quiet 200, so a wrong ref is visible instead of looking like success.
      const marked = await markUpdateSeen(userId, id);
      if (!marked) {
        res.status(404).json({ success: false, error: 'No such update of yours.' });
        return;
      }
      res.status(200).json({ success: true, data: { update_ref: ref } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[updates] mark seen failed:', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

/** „Later" — give the update back instead of spending it. */
updatesRouter.post(
  '/:ref/snooze',
  param('ref').isString().trim().notEmpty(),
  body('days').optional().isInt({ min: MIN_SNOOZE_DAYS, max: MAX_SNOOZE_DAYS }),
  async (
    req: Request,
    res: Response<ApiResponse<{ update_ref: string; coming_back_in_days: number }>>,
  ) => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({
        success: false,
        error: `days must be a whole number between ${MIN_SNOOZE_DAYS} and ${MAX_SNOOZE_DAYS}.`,
      });
      return;
    }
    const ref = String(req.params.ref);
    const id = parseUpdateRef(ref);
    if (id === null) {
      res.status(400).json({
        success: false,
        error: 'Unknown update_ref — take it from GET /updates.',
      });
      return;
    }
    const days = Number((req.body as { days?: number }).days ?? DEFAULT_SNOOZE_DAYS);
    const userId = String((req as AuthenticatedRequest).user.userId);
    try {
      // Scoped to the caller inside snoozeUpdate — somebody else's ref is a
      // 404 here rather than a postponement of a row that is not theirs.
      const moved = await snoozeUpdate(userId, id, days);
      if (!moved) {
        res.status(404).json({ success: false, error: 'No such update waiting for you.' });
        return;
      }
      res.status(200).json({ success: true, data: { update_ref: ref, coming_back_in_days: days } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[updates] snooze failed:', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

/**
 * The frontend's 13 Oct ask: „ახლავე დაბრუნება" — a put-off update is due at once.
 *   DELETE /updates/:ref/snooze   200 { update_ref }
 *   400  not an update_ref        404  not yours, or not held for later
 */
updatesRouter.delete(
  '/:ref/snooze',
  param('ref').isString().trim().notEmpty(),
  async (req: Request, res: Response<ApiResponse<{ update_ref: string }>>) => {
    const ref = String(req.params.ref);
    const id = parseUpdateRef(ref);
    if (id === null) {
      res.status(400).json({
        success: false,
        error: 'Unknown update_ref — take it from GET /updates/held.',
      });
      return;
    }
    const userId = String((req as AuthenticatedRequest).user.userId);
    try {
      if (!(await bringUpdateBackNow(userId, id))) {
        res.status(404).json({ success: false, error: 'No such update held for you.' });
        return;
      }
      res.status(200).json({ success: true, data: { update_ref: ref } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[updates] bring back failed:', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

/**
 * #2080 (D703): flag a card to come back to, or clear the flag.
 *
 *   PUT    /updates/:ref/follow   200 { update_ref, followed: true }
 *   DELETE /updates/:ref/follow   200 { update_ref, followed: false }
 *   400  not an update_ref        404  no such update of yours
 */
function followRoute(followed: boolean) {
  return async (
    req: Request,
    res: Response<ApiResponse<{ update_ref: string; followed: boolean }>>,
  ): Promise<void> => {
    const ref = String(req.params.ref);
    const id = parseUpdateRef(ref);
    if (id === null) {
      res.status(400).json({
        success: false,
        error: 'Unknown update_ref — take it from GET /updates.',
      });
      return;
    }
    const userId = String((req as AuthenticatedRequest).user.userId);
    try {
      if (!(await setUpdateFollowed(userId, id, followed))) {
        res.status(404).json({ success: false, error: 'No such update of yours.' });
        return;
      }
      res.status(200).json({ success: true, data: { update_ref: ref, followed } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[updates] follow failed:', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  };
}

updatesRouter.put('/:ref/follow', param('ref').isString().trim().notEmpty(), followRoute(true));
updatesRouter.delete('/:ref/follow', param('ref').isString().trim().notEmpty(), followRoute(false));

export default updatesRouter;
