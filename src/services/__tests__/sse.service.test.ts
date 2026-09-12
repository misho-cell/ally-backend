import { Response } from 'express';
import {
  subscribeUserEvents,
  emitStepSummary,
  emitToolProgress,
  emitRunComplete,
} from '../sse.service';

// Capture everything written to a subscribed SSE stream. subscribeUserEvents
// only calls setHeader / flushHeaders / write, so a minimal stub suffices.
function fakeStream(): { res: Response; events: () => unknown[] } {
  const writes: string[] = [];
  const res = {
    setHeader: () => undefined,
    flushHeaders: () => undefined,
    write: (chunk: string) => {
      writes.push(chunk);
      return true;
    },
  } as unknown as Response;
  const events = (): unknown[] =>
    writes
      .filter((w) => w.startsWith('data: '))
      .map((w) => JSON.parse(w.slice('data: '.length)) as unknown);
  return { res, events };
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
