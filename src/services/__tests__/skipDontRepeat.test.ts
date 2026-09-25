import { readFileSync } from 'fs';
import { join } from 'path';

import {
  breakdownExcluding,
  heldUpdateKey,
  HeldUpdate,
  NOTHING_NAMED,
} from '../pendingUpdates.service';
import { renderPendingMessage } from '../pendingMessages';

/**
 * ⚠️ „SKIP, DON'T REPEAT" — the founder, 25 September ~00:30 Tbilisi, on our
 * 639, relayed through the tester's box (their 638).
 *
 * „The 'also waiting' line counts only what was NOT already listed above it.
 * Example from tonight: after the six own-goal questions are listed, the line
 * reads 'Also waiting: 2 how did it go questions and 1 search result.' If
 * nothing is left, no line at all."
 *
 * This is the second half of row 250. The first half made the line SAY what it
 * was counting instead of printing a number, and that is what made the fault
 * visible: his nine were six questions on his own goals — the very six the
 * reply had just listed to him by name — plus two debriefs and one search
 * result. Naming them did not create the repetition. It ended weeks of it
 * being invisible behind „9 more updates are waiting".
 *
 * ⚠️ AND THE OBVIOUS IMPLEMENTATION IS WRONG, which is what most of this file
 * is about. Six listed, six held, take six away — that arithmetic is right
 * only if the two sixes are the same six, and two numbers cannot say whether
 * they are. A goal the inbox named might not be held at all; a goal that is
 * held might never have been named. So the subtraction is by id.
 */
const held = (rows: readonly Partial<HeldUpdate>[]): HeldUpdate[] =>
  rows.map((row) => ({
    kind: row.kind ?? 'debrief',
    task_id: row.task_id ?? null,
    request_id: row.request_id ?? null,
  }));

describe('what was already named is not counted again', () => {
  /** The founder's own nine, and the line he said it should produce. */
  it('produces exactly the line the founder wrote', () => {
    const rows = held([
      { kind: 'goal_question', task_id: 5974 },
      { kind: 'goal_question', task_id: 6964 },
      { kind: 'goal_question', task_id: 5281 },
      { kind: 'goal_question', task_id: 5809 },
      { kind: 'goal_question', task_id: 3763 },
      { kind: 'goal_question', task_id: 5677 },
      { kind: 'debrief', task_id: 11 },
      { kind: 'debrief', task_id: 12 },
      { kind: 'search_followup', task_id: 13 },
    ]);
    const named = new Set(
      [5974, 6964, 5281, 5809, 3763, 5677].map((id) => String(heldUpdateKey('goal_question', id))),
    );

    const { count, by_kind } = breakdownExcluding(rows, named);
    const out = renderPendingMessage(
      { kind: 'more_pending', task_id: null, payload: { count, by_kind } },
      'en',
    );

    expect(count).toBe(3);
    expect(out?.text).toBe('Also waiting: 2 "how did it go" questions and one search result.');
    expect(out?.text).not.toContain('goals');
  });

  /** „If nothing is left, no line at all." A count of zero renders nothing. */
  it('disappears entirely when everything was already listed', () => {
    const rows = held([
      { kind: 'goal_question', task_id: 5974 },
      { kind: 'goal_question', task_id: 6964 },
    ]);
    const named = new Set([
      String(heldUpdateKey('goal_question', 5974)),
      String(heldUpdateKey('goal_question', 6964)),
    ]);

    const { count, by_kind } = breakdownExcluding(rows, named);

    expect(count).toBe(0);
    expect(
      renderPendingMessage(
        { kind: 'more_pending', task_id: null, payload: { count, by_kind } },
        'en',
      ),
    ).toBeNull();
  });

  it('leaves the line alone when nothing was named above it', () => {
    const rows = held([
      { kind: 'goal_question', task_id: 5974 },
      { kind: 'debrief', task_id: 11 },
    ]);

    expect(breakdownExcluding(rows, NOTHING_NAMED)).toEqual({
      count: 2,
      by_kind: { goal_question: 1, debrief: 1 },
    });
  });
});

/**
 * ⚠️ THE FAULT THIS WOULD HAVE BEEN, HAD IT SUBTRACTED TALLIES.
 *
 * These two cases pass under a by-id subtraction and fail under a by-count
 * one, which is the whole reason `heldUpdatesByKind` was replaced by a
 * function that returns rows. Both are ordinary: a goal is named by the inbox
 * because its question is outstanding, and held as a card only if a card was
 * queued and never released. The two sets overlap; they are not equal.
 */
describe('it subtracts by identity, never by arithmetic', () => {
  it('keeps a held question whose goal was never named', () => {
    const rows = held([{ kind: 'goal_question', task_id: 222 }]);
    const named = new Set([String(heldUpdateKey('goal_question', 111))]);

    expect(breakdownExcluding(rows, named)).toEqual({ count: 1, by_kind: { goal_question: 1 } });
  });

  it('does not let one kind cancel another', () => {
    const rows = held([{ kind: 'debrief', task_id: 7 }]);
    const named = new Set([String(heldUpdateKey('goal_question', 7))]);

    expect(breakdownExcluding(rows, named)).toEqual({ count: 1, by_kind: { debrief: 1 } });
  });

  /**
   * An introduction is named by its OWN id, not by the goal it hangs off —
   * `intro_request` rows carry `request_id` in the payload and usually no
   * task_id at all. Keying it by task_id would have silently excluded nothing,
   * which is the failure that looks like success.
   */
  it('names an introduction by its request id', () => {
    const rows = held([{ kind: 'intro_request', request_id: '1057' }]);

    expect(
      breakdownExcluding(rows, new Set([String(heldUpdateKey('intro_request', 1057))])),
    ).toEqual({
      count: 0,
      by_kind: {},
    });
    expect(
      breakdownExcluding(rows, new Set([String(heldUpdateKey('intro_request', 1058))])),
    ).toEqual({
      count: 1,
      by_kind: { intro_request: 1 },
    });
  });

  /** A row with no id cannot be the thing named above, so it is never dropped. */
  it('never excludes a row that has no id of its own', () => {
    const rows = held([{ kind: 'search_followup', task_id: null }]);

    expect(
      breakdownExcluding(rows, new Set(['goal_question:null', 'search_followup:'])).count,
    ).toBe(1);
  });

  /** The id is compared as text on both sides — 1057 the number is 1057 the string. */
  it('spells an id the same way whichever side writes it', () => {
    expect(heldUpdateKey('intro_request', 1057)).toBe(heldUpdateKey('intro_request', '1057'));
    expect(heldUpdateKey('intro_request', null)).toBeNull();
    expect(heldUpdateKey('intro_request', '   ')).toBeNull();
  });
});

/**
 * The rule has to survive the model calling the two tools in either order, and
 * it has to hold on BOTH surfaces. The second is this row's own lesson from
 * the morning: a tool that is right in the app and silent in the connector is
 * a fault, not a fix.
 */
describe('both surfaces, and in any order', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('strikes out what was named at DELIVERY, not when the count is read', () => {
    const take = chat.slice(chat.indexOf('function takePendingItems(runId: string)'));

    expect(take.slice(0, 1200)).toContain('runInboxNamed.get(runId)');
    expect(take.slice(0, 1200)).toContain('morePendingAfterNaming');
  });

  it('records what the inbox named, by id', () => {
    const handler = chat.slice(
      chat.indexOf("case 'check_my_inbox': {"),
      chat.indexOf("case 'get_pending_updates': {"),
    );

    expect(handler).toContain('noteInboxNamed(runId');
    expect(handler).toContain('heldUpdateKey(GOAL_QUESTION_KIND, g.task_id)');
    expect(handler).toContain('heldUpdateKey(INTRO_REQUEST_KIND, request.id)');
  });

  /** „I could not look" is not „there was nothing to take off". */
  it('leaves the card alone when the held rows could not be read', () => {
    const fn = chat.slice(chat.indexOf('function morePendingAfterNaming'));

    expect(fn.slice(0, 600)).toContain('if (held === undefined || named.size === 0) return item;');
  });

  /** A read that hit its ceiling has not seen everything, so it names nothing. */
  it('counts instead of naming when the read did not see all of them', () => {
    expect(chat).toContain('held.length <= HELD_ROWS_READ_LIMIT');
  });

  it('gives the connector the same breakdown and the same rule', () => {
    const handlers = readFileSync(join(__dirname, '..', 'mcp', 'handlers.ts'), 'utf8');
    const texts = readFileSync(join(__dirname, '..', 'mcp', 'texts.ts'), 'utf8');

    expect(handlers).toContain('more_pending_by_kind');
    expect(texts).toContain('SKIP WHAT YOU HAVE ALREADY LISTED');
    expect(texts).toContain('IF NOTHING IS LEFT THERE IS NO LINE AT ALL');
  });
});
