import { readFileSync } from 'fs';
import { join } from 'path';

import {
  breakdownExcluding,
  heldUpdateKey,
  HeldUpdate,
  NOTHING_NAMED,
} from '../pendingUpdates.service';
import { renderPendingMessage } from '../pendingMessages';
import { claimsTheReplyMade } from '../chat.service';

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
    // Anchored on the NAME, not the signature: it grew a `reply` parameter the
    // same night, and an assertion pinned to an argument list is an assertion
    // about how the code is written rather than what it does.
    const take = chat.slice(chat.indexOf('function takePendingItems('));

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

/**
 * ⚠️ THE FAULT THE RULE ITSELF INTRODUCED, FOUND BY THE TESTER FORTY MINUTES
 * AFTER IT SHIPPED — on the founder's own account.
 *
 * Thread 25215, 25 September 21:22 UTC. Six goals were waiting on him. I read
 * all six from the base before believing it: still open, still flagged, each
 * holding a card. `check_my_inbox` returned all six. THE REPLY NAMED FIVE. And
 * the „also waiting" card, struck clean of all six by the rule above, named
 * none — so 6964, his message to Lika, was on no screen at all, having been on
 * one at 19:33.
 *
 * I HAD WRITTEN THE RISK DOWN IN THE MESSAGE THAT ANNOUNCED THE FIX, and
 * guarded the wrong half of it. „A goal named above but not held would cancel
 * a DIFFERENT goal's card" — that is the two sets differing by ID, and it was
 * handled. The half I did not guard is the two sets differing because THE
 * MODEL CHOSE TO SAY LESS, which is not an edge case: it is what anything does
 * with a list of six.
 *
 * So a claim is now „the tool handed it over AND the reply contains it". The
 * check is built to fail the cheap way: not matching costs a repeated line,
 * matching wrongly costs somebody a question they never hear about.
 */
describe('only what the reply actually said is struck off', () => {
  const claim = (key: string, mustAppear: string | null) => ({ key, mustAppear });

  it("keeps the card for a goal the reply left out — the founder's sixth", () => {
    const claims = [
      claim('goal_question:5974', 'I need two painters for a flat in Vake'),
      claim('goal_question:6964', 'i need to send the screenshots to Lika'),
    ];
    const reply = 'You have one goal waiting: „I need two painters for a flat in Vake".';

    const said = claimsTheReplyMade(claims, reply);

    expect(said.has('goal_question:5974')).toBe(true);
    expect(said.has('goal_question:6964')).toBe(false);
  });

  /** And the one that WAS said still goes, or the founder's rule does nothing. */
  it('strikes off the ones it can find, so the rule still works', () => {
    const claims = [
      claim('goal_question:5677', 'I need a good roofer in Tbilisi for a small job'),
      claim('goal_question:5281', 'I need a reliable web designer in Tbilisi'),
    ];
    const reply =
      'Two of your goals are waiting on you: „I need a good roofer in Tbilisi for a small ' +
      'job", and „I need a reliable web designer in Tbilisi".';

    expect(claimsTheReplyMade(claims, reply).size).toBe(2);
  });

  /** Quotes, dashes and capitals are what a model rearranges when it quotes. */
  it('does not care about punctuation, quoting or case', () => {
    const claims = [claim('goal_question:1', 'I need a good roofer in Tbilisi')];

    expect(claimsTheReplyMade(claims, '— "i need a GOOD roofer, in Tbilisi" …').size).toBe(1);
  });

  /**
   * „I need" is the opening of half the goals in the base. A prefix short
   * enough to match six different goals would strike off five of them on the
   * strength of the sixth being mentioned.
   */
  it('will not let one goal answer for another that merely starts the same', () => {
    const claims = [claim('goal_question:9', 'I need a notary in Batumi before Friday')];
    const reply = 'Your goal „I need two painters for a flat in Vake" is waiting.';

    expect(claimsTheReplyMade(claims, reply).size).toBe(0);
  });

  /** A goal whose title was never recorded cannot be proved said, so it stays. */
  it('never strikes off an item with nothing to match on', () => {
    expect(claimsTheReplyMade([claim('goal_question:3', null)], 'anything at all').size).toBe(0);
    expect(claimsTheReplyMade([claim('goal_question:4', '   ')], 'anything at all').size).toBe(0);
  });

  it('is what delivery uses, and it is given the finished reply', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const take = chat.slice(chat.indexOf('function takePendingItems(runId: string'));

    expect(take.slice(0, 900)).toContain(
      'claimsTheReplyMade(runInboxNamed.get(runId) ?? [], reply)',
    );
    expect(chat).toContain('takePendingItems(runId, reply)');
  });

  /** And the model is told to name them all, so a repeat is rare as well as cheap. */
  it('asks for every item by name rather than a summary', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

    expect(chat).toContain('Name EVERY item above');
    expect(chat).toContain('fewer words per item, never fewer items');
  });
});

/**
 * ⚠️ D500 OPTION A — THE FOUNDER'S CHOICE, APPROVED BY MISHO, AND THE END OF
 * TWO BUILDS' WORTH OF GUESSING.
 *
 * „The also-waiting line counts only what was NOT already listed above it."
 * Making that true needs the server to KNOW what was listed. It guessed twice:
 *
 *   1. It assumed the model repeated everything it was handed. The model
 *      dropped one of the founder's six goals and that goal vanished from both
 *      the reply and the card.
 *   2. It looked for the goal's own words in the reply. The model TRANSLATES
 *      them — „I need two painters for a flat in Vake" came back as „ვაკეში
 *      მღებავების გეგმაზე" — so nothing ever matched and everything repeated.
 *
 * Both failures have one cause: the list was the model's to write. Now it is
 * ours. „I wrote it" and „I think the reply mentioned it" are different facts,
 * and the claim carries which one it is.
 */
describe('the server writes the list, so it knows what was said', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('delivers the goals as its own card', () => {
    const handler = chat.slice(
      chat.indexOf("case 'check_my_inbox': {"),
      chat.indexOf("case 'get_pending_updates': {"),
    );

    expect(handler).toContain('MY_GOALS_WAITING_KIND');
    expect(handler).toContain('goals: myGoals.map(');
  });

  it('marks them named by US, not by the reply', () => {
    const handler = chat.slice(
      chat.indexOf("case 'check_my_inbox': {"),
      chat.indexOf("case 'get_pending_updates': {"),
    );

    expect(handler).toContain('named: !PENDING_AS_MESSAGES_OFF');
  });

  /** And a claim written by us needs nothing found in the reply. */
  it('counts a self-written claim without reading anything', () => {
    const said = claimsTheReplyMade(
      [{ key: 'goal_question:6964', mustAppear: null, named: true }],
      'a reply that says nothing about it at all',
    );

    expect(said.has('goal_question:6964')).toBe(true);
  });

  /** The text-evidence path survives for the things a model still narrates. */
  it('still requires evidence for a claim nobody wrote a card for', () => {
    const said = claimsTheReplyMade(
      [{ key: 'intro_request:1057', mustAppear: 'Nino Abramishvili' }],
      'a reply that says nothing about it at all',
    );

    expect(said.size).toBe(0);
  });

  it('tells the model this one list is not its to write', () => {
    expect(chat).toContain('THE EXCEPTION IS my_goals_waiting_on_me');
    expect(chat).toContain('Do NOT list them');
  });

  /** The card names each goal, and says the question when there is one. */
  it('writes a line per goal, with its question where there is one', () => {
    const card = renderPendingMessage(
      {
        kind: 'my_goals_waiting',
        task_id: null,
        payload: {
          goals: [
            { task_id: 5974, goal: 'Painters for the Vake flat', question: 'Approve the list?' },
            { task_id: 6964, goal: 'The message to Lika', question: null },
          ],
        },
      },
      'en',
    );

    expect(card?.text).toContain('2 of your goals are waiting on your answer:');
    expect(card?.text).toContain('• Painters for the Vake flat — Approve the list?');
    // A goal whose question was never written down is still named.
    expect(card?.text).toContain('• The message to Lika');
  });

  it('says nothing rather than printing a blank bullet', () => {
    expect(
      renderPendingMessage(
        { kind: 'my_goals_waiting', task_id: null, payload: { goals: [{ task_id: 1 }] } },
        'en',
      ),
    ).toBeNull();
  });
});
