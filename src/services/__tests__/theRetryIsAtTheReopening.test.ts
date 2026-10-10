import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Tester 941, the second half of 929 (goal 12211): the refusal named the
 * reopening minute in Tbilisi time and woke the goal then — and the same run's
 * set_task_wake(24) moved the wake to the next morning. The run now keeps the
 * earliest reopening per goal and set_task_wake keeps the wake no later.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

describe('the retry happens when the recipient can be asked again', () => {
  it('the refusal carries the reopening for the run', () => {
    const refusal = asks.slice(asks.indexOf("reason: 'recipient_daily_limit_reached'"));
    expect(refusal.slice(0, 300)).toContain('reopens_at: reopensAt.toISOString()');
  });

  it('ask_contact remembers it for the goal', () => {
    const tool = chat.slice(chat.indexOf("case 'ask_contact': {"));
    expect(tool.slice(0, 6000)).toContain(
      'noteWakeNoLaterThan(runId, taskId, (askOutcome as { reopens_at?: unknown }).reopens_at);',
    );
  });

  it('set_task_wake keeps the wake no later than the reopening', () => {
    const tool = chat.slice(chat.indexOf("case 'set_task_wake': {"));
    const body = tool.slice(0, tool.indexOf("case 'stop_contacting_me':"));
    expect(body).toContain('wakeCapFor(runId, wakeTaskId)');
    expect(body).toContain('await wakeTaskNoLaterThan(wakeTaskId, reopens)');
  });

  it('keeps the earliest reopening and forgets it with the run', () => {
    const note = chat.slice(chat.indexOf('function noteWakeNoLaterThan'));
    expect(note.slice(0, 600)).toContain('when < earlier');
    const clear = chat.slice(chat.indexOf('function clearRunState'));
    // The whole function, so a line added above it never pushes this one out.
    expect(clear.slice(0, clear.indexOf('\n}\n'))).toContain('runWakeCaps.delete(runId)');
  });
});
