import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 5321 (the tester's 200-seat re-run, 15 Oct): every run answered, but a send
 * took 14.6 s to be accepted — its lookups stood in the runs' queue.
 */
describe('accepting a message', () => {
  const routes = readFileSync(join(__dirname, '..', 'threads.routes.ts'), 'utf8');

  it('enters the intake lane before the sign-in check runs', () => {
    const laneAt = routes.indexOf("threadsRouter.use('/:id/message'");
    const authAt = routes.indexOf('threadsRouter.use(authenticateJwt, requireUserRole);');
    expect(laneAt).toBeGreaterThan(-1);
    expect(authAt).toBeGreaterThan(laneAt);
    expect(routes.slice(laneAt, authAt)).toContain('onIntakeLane(next)');
  });

  /**
   * Misho, 16 Oct: a hello took 4 s from the 202 in the 5th 200 run, 0.5 s
   * alone. The status, the cleared question and the owner's own message were
   * still written on the lane after the 202, behind every other send.
   */
  it('leaves the lane right after the 202, before anything else is written', () => {
    const acceptedAt = routes.indexOf('res.status(202).json({ success: true, runId });');
    const leaveAt = routes.indexOf('await leaveIntakeLane(async () => {', acceptedAt);
    const statusAt = routes.indexOf("void setThreadStatus(userId, threadId, 'working'", acceptedAt);
    const storeAt = routes.indexOf('await keepUserMessage(userId, threadId, message);', acceptedAt);
    const runAt = routes.indexOf('runOwnerMessage({', acceptedAt);
    expect(acceptedAt).toBeGreaterThan(-1);
    expect(leaveAt).toBeGreaterThan(acceptedAt);
    for (const after of [statusAt, storeAt, runAt]) expect(after).toBeGreaterThan(leaveAt);
  });
});
