import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 958 (13 Oct, the [post-run] lines of 0235): the wallet debit was 1.2 s of
 * every answer — eight round trips the owner waited on for nothing the answer
 * carries. It now starts inside processChat and is awaited by the route only
 * after the answer is sent, still inside the run's in-flight mark.
 */
const CHAT = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
const ROUTE = readFileSync(
  join(__dirname, '..', '..', 'api', 'routes', 'threads.routes.ts'),
  'utf8',
);

describe('the debit waits for the answer, not the answer for the debit', () => {
  it('starts without being awaited and is handed back with the result', () => {
    expect(CHAT).toContain('const afterReply: Promise<void> = (async (): Promise<void> => {');
    expect(CHAT).toMatch(
      /shareText !== undefined && \{ shareText \}\),\s*\.\.\.\(ownerDecidesNext && \{ ownerDecidesNext: true \}\),\s*afterReply,/u,
    );
    const debit = CHAT.indexOf('debitRun(payerId, runId)');
    expect(debit).toBeGreaterThan(CHAT.indexOf('const afterReply: Promise<void>'));
  });

  it('is awaited by the route right after the answer is sent, before the run lets go', () => {
    const emit = ROUTE.indexOf(
      'emitRunComplete(userId, threadId, runId, {\n        reply: result.reply,',
    );
    const wait = ROUTE.indexOf('await result.afterReply;');
    expect(emit).toBeGreaterThan(-1);
    expect(wait).toBeGreaterThan(emit);
    expect(wait).toBeLessThan(ROUTE.indexOf('endRun(runId);'));
  });
});
