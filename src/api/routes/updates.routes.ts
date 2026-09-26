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
  countHeldUpdates,
  snoozeUpdate,
  markUpdateSeen,
  toUpdateRef,
  parseUpdateRef,
  PendingUpdate,
  MIN_SNOOZE_DAYS,
  MAX_SNOOZE_DAYS,
  DEFAULT_SNOOZE_DAYS,
} from '../../services/pendingUpdates.service';
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
}

function updatePayload(u: PendingUpdate): UpdateRow {
  return {
    update_ref: toUpdateRef(u.id),
    kind: u.kind,
    payload: u.payload,
    task_id: u.task_id ?? null,
  };
}

interface UpdatesView {
  readonly due: readonly UpdateRow[];
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
updatesRouter.get('/', async (req: Request, res: Response<ApiResponse<UpdatesView>>) => {
  const userId = String((req as AuthenticatedRequest).user.userId);
  try {
    const due = await getPendingUpdates(userId);
    const [seen, held] = await Promise.all([listSeenUpdates(userId), countHeldUpdates(userId)]);
    const dueNow = new Set(due.map((u) => u.id));
    res.status(200).json({
      success: true,
      data: {
        due: due.map(updatePayload),
        seen: seen.filter((u) => !dueNow.has(u.id)).map(updatePayload),
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

export default updatesRouter;
