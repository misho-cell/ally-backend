import { readFileSync } from 'fs';
import { join } from 'path';

/** #8581: DELETE /admin/test-accounts/:id — the route's own promises. */
const ROUTES = readFileSync(join(__dirname, '..', 'admin.routes.ts'), 'utf8');
const HANDLER = ROUTES.slice(
  ROUTES.indexOf("adminRouter.delete(\n  '/test-accounts/:id',"),
  ROUTES.indexOf("'/test-accounts/:id/memberships'"),
);

describe('DELETE /admin/test-accounts/:id', () => {
  it('exists, and validates the seat id and dry_run', () => {
    expect(HANDLER).toContain("param('id').isInt({ min: 1 })");
    expect(HANDLER).toContain("queryParam('dry_run').optional().isIn(['true', 'false'])");
  });

  it('is a dry run unless dry_run=false is said', () => {
    expect(HANDLER).toContain("const dryRun = req.query['dry_run'] !== 'false';");
  });

  it('answers a refusal with 403 and a failure with 500, never 200 with an error', () => {
    expect(HANDLER).toContain('res.status(403).json({ success: false, error: outcome.refusal });');
    expect(HANDLER).toContain(
      "res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });",
    );
    expect(HANDLER).toContain('await deleteTestSeat(seatId, dryRun)');
  });
});
