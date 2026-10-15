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

  it('starts the run off the lane, after the 202', () => {
    const acceptedAt = routes.indexOf('res.status(202).json({ success: true, runId });');
    const leaveAt = routes.indexOf('leaveIntakeLane(() =>', acceptedAt);
    const runAt = routes.indexOf('runOwnerMessage({', acceptedAt);
    expect(acceptedAt).toBeGreaterThan(-1);
    expect(leaveAt).toBeGreaterThan(acceptedAt);
    expect(runAt).toBeGreaterThan(leaveAt);
  });
});
