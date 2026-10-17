import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * F5 of the tester's launch report (60358), the 200-seat test of 15 Oct:
 * thread 52713 got its answer and then „ტექნიკური შეფერხება…" under it; five
 * threads failed with no line at all, the error line's own write having hit
 * the full pool.
 */
describe('a run that fails', () => {
  const routes = readFileSync(join(__dirname, '..', 'threads.routes.ts'), 'utf8');
  const failure = routes.slice(
    routes.indexOf("console.error('[POST /threads/:id/message] run failed'"),
  );

  it('first asks whether its answer is already in the thread, and then stops', () => {
    const askAt = failure.indexOf(
      'if (await answerAlreadyStored(userId, threadId, runId)) return;',
    );
    const lineAt = failure.indexOf('saveErrorLineOnce(threadId, userId, userMessage, runId);');
    expect(askAt).toBeGreaterThan(-1);
    expect(lineAt).toBeGreaterThan(askAt);
  });

  it('reads only this run’s real answer, and ends the run on the screen with it', () => {
    const fn = routes.slice(routes.indexOf('async function answerAlreadyStored('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain(
      "WHERE thread_id = $1 AND run_id = $2 AND role = 'assistant' AND kind = 'message'",
    );
    expect(body).toContain("AND content <> ''");
    expect(body).toContain('emitRunComplete(userId, threadId, runId, { reply: answer });');
    expect(body).toContain(
      "if (openGoal !== null) void setThreadStatus(userId, threadId, 'waiting');",
    );
    expect(body).toContain(
      "else if (await chatHadAGoal(threadId)) void setThreadStatus(userId, threadId, 'done');",
    );
  });

  it('tries the error line a second time when the first write fails', () => {
    const fn = routes.slice(routes.indexOf('function saveErrorLineOnce('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('write().catch(() => {');
    expect(body).toContain('ERROR_LINE_RETRY_MS');
  });
});
