import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 4126 (the tester's box 60032): a seat made by the admin route never passes
 * through sign-up, so the registration research run could not be tested on a
 * fictional seat. This route queues that same run for one fictional seat.
 */
const routes = readFileSync(join(__dirname, '..', 'admin.routes.ts'), 'utf8');
const start = routes.indexOf("'/test-accounts/:id/registration-research'");
const handler = routes.slice(start, routes.indexOf('adminRouter.', start + 1));

describe('the registration research for a fictional seat', () => {
  it('exists behind the admin router', () => {
    expect(start).toBeGreaterThan(0);
    expect(start).toBeGreaterThan(routes.indexOf('adminRouter.use('));
  });

  it('refuses a real person before queueing anything', () => {
    const guard = handler.indexOf('await isOperableTestSeat(target, isFictionalTestAccount)');
    const queue = handler.indexOf('await queueRegistrationResearch(Number(target))');
    expect(guard).toBeGreaterThan(0);
    expect(queue).toBeGreaterThan(guard);
    expect(handler).toContain('res.status(403)');
  });

  it('uses the queue sign-up uses, and says why in the log', () => {
    expect(handler).toContain("body('note').isString().trim().isLength({ min: 3, max: 500 })");
    expect(handler).toContain('[test-research] admin ${admin} queued the registration research');
  });

  it('answers a failure plainly', () => {
    expect(handler).toContain(
      "res.status(500).json({ success: false, error: 'სერვერის შეცდომა' })",
    );
  });
});
