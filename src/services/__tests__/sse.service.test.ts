import { Response } from 'express';
import {
  subscribeUserEvents,
  emitStepSummary,
  emitToolProgress,
  emitRunComplete,
} from '../sse.service';

// Capture everything written to a subscribed SSE stream. subscribeUserEvents
// only calls setHeader / flushHeaders / write, so a minimal stub suffices.
function fakeStream(): {
  res: Response;
  events: () => unknown[];
  frames: () => readonly string[];
} {
  const writes: string[] = [];
  const res = {
    setHeader: () => undefined,
    flushHeaders: () => undefined,
    write: (chunk: string) => {
      writes.push(chunk);
      return true;
    },
  } as unknown as Response;
  /**
   * Deliberately naive, and left that way on purpose.
   *
   * A frame is „data: {…}\nid: N\n\n". This parser reads the chunk as if the
   * payload were the first thing in it — which is how somebody writing an SSE
   * reader by hand does it, and this repo's own harness is the evidence: it
   * was written that way before the id line existed. The stream is behind a
   * Bearer header, so the client cannot be a native EventSource and is a
   * polyfill or a hand-rolled reader nobody here can see. If anyone reorders
   * those two lines, this test is what says so.
   */
  const events = (): unknown[] =>
    writes
      .filter((w) => w.startsWith('data: '))
      .map((w) => JSON.parse(w.slice('data: '.length, w.indexOf('\nid: '))) as unknown);
  return { res, events, frames: (): readonly string[] => [...writes] };
}

const USER_ID = 'user-sse-test';
const PHONE = '+995511141587';

describe('sse.service phone scrubbing', () => {
  it('redacts a phone number from step narration (the reported leak)', () => {
    const { res, events } = fakeStream();
    const unsubscribe = subscribeUserEvents(USER_ID, res);

    emitStepSummary(USER_ID, 1, 'run1', `Only one Georgian number so far (${PHONE}).`);

    const step = events().find((e) => (e as { event: string }).event === 'step_summary') as {
      text: string;
    };
    expect(step.text).not.toContain(PHONE);
    // The placeholder itself never renders either — the parenthesized redaction
    // disappears as one unit (ticket 6 item 13: "[hidden]" reached a user).
    expect(step.text).not.toContain('[hidden]');
    expect(step.text).toBe('Only one Georgian number so far.');
    unsubscribe();
  });

  it('redacts a phone from a tool_progress spinner line', () => {
    const { res, events } = fakeStream();
    const unsubscribe = subscribeUserEvents(USER_ID, res);

    emitToolProgress(USER_ID, 1, 'run1', `pulling profile for ${PHONE}`);

    const prog = events().find((e) => (e as { event: string }).event === 'tool_progress') as {
      message: string;
    };
    expect(prog.message).not.toContain(PHONE);
    unsubscribe();
  });

  it('redacts phones from the final reply and nested options', () => {
    const { res, events } = fakeStream();
    const unsubscribe = subscribeUserEvents(USER_ID, res);

    emitRunComplete(USER_ID, 1, 'run1', {
      reply: `You can reach them at ${PHONE}.`,
      options: [{ name: 'Nino', phone: PHONE }],
    });

    const done = events().find((e) => (e as { event: string }).event === 'run_complete');
    const serialized = JSON.stringify(done);
    expect(serialized).not.toContain(PHONE);
    unsubscribe();
  });

  /**
   * Ticket 17 Task 39, the frontend's own catch on build c5baaa8: the tool
   * result never leaves the backend, so the share button was picking whichever
   * paragraph of the answer contained a link. The text now travels as its own
   * field, and is absent when no invite link was asked for — so the client can
   * tell "share this" from "there is nothing to share".
   */
  it('carries the ready-to-send invitation as its own field, and omits it otherwise', () => {
    const { res, events } = fakeStream();
    const unsubscribe = subscribeUserEvents(USER_ID, res);
    // No em dash, because the display scrub rewrites one — the production text
    // avoids it for exactly that reason, so what is written is what is sent.
    const text = 'Netai-ს ვიყენებ: აქ არის https://www.netai.guru/join?ref=ABCD1234';

    emitRunComplete(USER_ID, 1, 'run1', { reply: 'აი შენი ბმული.', share_text: text });
    emitRunComplete(USER_ID, 1, 'run2', { reply: 'სხვა პასუხი.' });

    const [withText, without] = events().filter(
      (e) => (e as { event: string }).event === 'run_complete',
    ) as { share_text?: string }[];
    expect(withText?.share_text).toBe(text);
    expect(without && 'share_text' in without).toBe(false);
    unsubscribe();
  });

  /**
   * Ticket 17 Task 39, third round. The share text reaches the client two ways
   * — this event live, the stored row after a reload — and only this one
   * scrubbed. They agreed only because the copy happened to contain nothing
   * the scrub touches, and the wording is the founder's to change at any time.
   * The value is scrubbed once at the source now, so passing it through here
   * again must not change it a second time.
   */
  it('is idempotent on an already-scrubbed share text', () => {
    const { res, events } = fakeStream();
    const unsubscribe = subscribeUserEvents(USER_ID, res);
    const once = 'Netai-ს ვიყენებ: აქ არის https://www.netai.guru/join?ref=IDEM1';

    emitRunComplete(USER_ID, 1, 'run1', { reply: 'x', share_text: once });

    const done = events().find((e) => (e as { event: string }).event === 'run_complete') as {
      share_text?: string;
    };
    expect(done.share_text).toBe(once);
    unsubscribe();
  });

  it('keeps ISO dates and short numbers intact', () => {
    const { res, events } = fakeStream();
    const unsubscribe = subscribeUserEvents(USER_ID, res);

    emitStepSummary(USER_ID, 1, 'run1', 'joined 2024-03-01, 42 contacts');

    const step = events().find((e) => (e as { event: string }).event === 'step_summary') as {
      text: string;
    };
    expect(step.text).toBe('joined 2024-03-01, 42 contacts');
    unsubscribe();
  });
});

/**
 * A stream that drops must be able to pick up where it left off.
 *
 * Three reports in one evening of one shape: the answer is in the thread, the
 * open page does not have it, a reload shows it at once. Thread 16907 on 17
 * September is the clean case — the run finished at 19:29:14, was never
 * dropped, and the route reached emitRunComplete; the page still read
 * „working" ninety seconds later.
 *
 * Every event was written to whatever sockets happened to be open at that
 * instant and then forgotten. A phone that slept, a tunnel that blinked, a
 * proxy that recycled the connection — each lost the answer for good.
 */
describe('a reconnecting stream is given what it missed', () => {
  const RESUMING_USER = 'user-sse-resume';

  it('numbers every frame, because the id is what a client resumes from', () => {
    const { res, frames } = fakeStream();
    const stop = subscribeUserEvents(RESUMING_USER, res);

    emitStepSummary(RESUMING_USER, 1, 'run1', 'first');
    emitStepSummary(RESUMING_USER, 1, 'run1', 'second');

    const ids = frames()
      .map((f) => /^id: (\d+)$/m.exec(f)?.[1])
      .filter((id): id is string => id !== undefined)
      .map(Number);
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBeGreaterThan(ids[0]);
    stop();
  });

  it('replays only what came AFTER the last id the client saw', () => {
    const { res: first, frames: firstFrames } = fakeStream();
    const stop = subscribeUserEvents(RESUMING_USER, first);
    emitStepSummary(RESUMING_USER, 1, 'run1', 'seen by the first stream');
    const lastSeen = /^id: (\d+)$/m.exec(firstFrames()[0])?.[1] ?? '0';
    stop();

    // The gap: two events with nobody listening. Today they are gone for good.
    emitStepSummary(RESUMING_USER, 1, 'run1', 'missed one');
    emitRunComplete(RESUMING_USER, 1, 'run1', { reply: 'the answer they never saw' });

    const { res: second, events } = fakeStream();
    const stopSecond = subscribeUserEvents(RESUMING_USER, second, null, lastSeen);

    const replayed = events() as { event: string; text?: string; reply?: string }[];
    expect(replayed.map((e) => e.event)).toEqual(['step_summary', 'run_complete']);
    expect(replayed[1].reply).toBe('the answer they never saw');
    // Not the one it already had.
    expect(replayed.some((e) => e.text === 'seen by the first stream')).toBe(false);
    stopSecond();
  });

  it('gives a fresh page nothing — it loads the thread from the database', () => {
    emitStepSummary('user-sse-fresh', 1, 'run1', 'before anyone connected');

    const { res, events } = fakeStream();
    const stop = subscribeUserEvents('user-sse-fresh', res);

    expect(events()).toEqual([]);
    stop();
  });

  it('treats a header that is not a number as no header', () => {
    emitStepSummary('user-sse-junk', 1, 'run1', 'earlier');

    const { res, events } = fakeStream();
    const stop = subscribeUserEvents('user-sse-junk', res, null, 'not-a-number');

    expect(events()).toEqual([]);
    stop();
  });

  /**
   * The assertion moved from „nothing at all" to „nothing of A's", because an
   * id of 1 now means something it did not mean before: it is below this
   * process's epoch, so it was issued by an earlier process and B is told its
   * stream cannot be resumed from memory. That reset frame carries no event of
   * A's and no event of anyone's — it is a fact about B's own socket — so the
   * property this test exists for is unchanged and is now asserted directly
   * rather than as a side effect of the reply being empty.
   */
  it('keeps one user’s tail out of another’s', () => {
    emitStepSummary('user-sse-a', 1, 'run1', 'belongs to A');

    const { res, events } = fakeStream();
    const stop = subscribeUserEvents('user-sse-b', res, null, '1');

    expect(events().filter((e) => (e as { event: string }).event !== 'stream_reset')).toEqual([]);
    stop();
  });
});

/**
 * Ticket 20, after the tester's clean repeat of 19 September did NOT reproduce
 * their own report from an hour earlier: same build, same account, same
 * approve-then-wait, one page dead for three minutes and one live throughout.
 *
 * An intermittent that a reload cures, on a socket that is open, is the exact
 * shape of an id the client believes it has already seen. The counter used to
 * start at 0 in every process, so it did — for as long as it took a fresh
 * counter to climb past the old high-water mark. Whether that is what bit them
 * is a frontend question nobody here can answer; that the server offered it is
 * not, and it is the server's to close either way.
 */
describe('an event id survives a restart', () => {
  it('is anchored to the clock, so a new process cannot re-issue an old id', () => {
    const { res, frames } = fakeStream();
    const stop = subscribeUserEvents('user-sse-epoch', res);

    emitStepSummary('user-sse-epoch', 1, 'run1', 'one');
    const id = Number(/^id: (\d+)$/m.exec(frames()[0])?.[1]);

    // Epoch milliseconds, not a count. A counter that started at 0 in this
    // process would be a handful; one that started at 0 in a process an hour
    // old would be in the hundreds. Both fail here, which is the point: every
    // id this process issues is above every id any earlier process could have,
    // so the collision that makes a client drop live events cannot occur.
    //
    // A WINDOW rather than „not ahead of the clock", and the first draft of
    // this test is why: run alone it passed, and in the full suite the id came
    // back seven milliseconds into the future. That is the documented
    // overshoot — `Math.max(sequence + 1, now)` runs ahead by however many
    // events are issued inside one millisecond, and a test file firing a
    // couple of dozen in a row is the one place here that does it. Production
    // issues single figures per MINUTE. The overshoot is bounded by the event
    // count, so a minute of slack cannot be reached by anything but a fault.
    expect(Math.abs(id - Date.now())).toBeLessThan(60_000);
    stop();
  });

  it('tells a stream resuming from a dead process to refetch, instead of nothing', () => {
    const { res, events } = fakeStream();
    // 54 is a real id from the logs of 19 September — a container forty
    // minutes old. Small ids are what the old counter produced.
    const stop = subscribeUserEvents('user-sse-restarted', res, null, '54');

    expect(events()).toEqual([{ event: 'stream_reset', reason: 'server_restarted' }]);
    stop();
  });

  it('says nothing of the kind to a stream resuming inside this process', () => {
    const { res: first, frames: firstFrames } = fakeStream();
    const stop = subscribeUserEvents('user-sse-samerun', first);
    emitStepSummary('user-sse-samerun', 1, 'run1', 'seen');
    const lastSeen = /^id: (\d+)$/m.exec(firstFrames()[0])?.[1] ?? '0';
    stop();

    emitRunComplete('user-sse-samerun', 1, 'run1', { reply: 'missed while away' });

    const { res: second, events } = fakeStream();
    const stopSecond = subscribeUserEvents('user-sse-samerun', second, null, lastSeen);

    // An ordinary reconnect: the buffer can serve it, so it is served and not
    // sent away to refetch.
    expect((events() as { event: string }[]).map((e) => e.event)).toEqual(['run_complete']);
    stopSecond();
  });
});
