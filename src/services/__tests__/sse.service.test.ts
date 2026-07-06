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
    expect(step.text).toContain('[hidden]');
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
