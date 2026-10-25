import { readFileSync } from 'fs';
import { join } from 'path';

/** Ops (25 Oct): which commit is live, behind the admin login only. */
describe('the live commit', () => {
  const routes = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
    'utf8',
  );
  const index = readFileSync(join(__dirname, '..', '..', 'index.ts'), 'utf8');

  it('is read from what Railway built, behind the admin router', () => {
    expect(routes).toContain("adminRouter.get('/version'");
    expect(routes).toContain('process.env.RAILWAY_GIT_COMMIT_SHA');
  });

  it('is still not on the public health probe', () => {
    expect(index).toContain('res.json({ success: true, data: { alive: true } });');
  });
});
