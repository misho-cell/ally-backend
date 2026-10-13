import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 4885 (Giorgi, 13 Oct): every team-tasks tab reads to-build first and tested
 * last, with one line of counts per status above it. The list answers both.
 */
const route = readFileSync(join(__dirname, '..', 'admin.routes.ts'), 'utf8');
const fn = route.slice(
  route.indexOf("  '/team-tasks',\n  queryParam('page')"),
  route.indexOf("adminRouter.post(\n  '/team-tasks'"),
);

describe('GET /admin/team-tasks', () => {
  it('answers the rows and the counts for the same tab', () => {
    expect(fn).toContain('Promise.all([listTeamTasks(page), countTeamTasks(page)])');
    expect(fn).toContain('data: { tasks, counts }');
  });

  it('still refuses an unknown page and never shows a database error', () => {
    expect(fn).toContain('res.status(400)');
    expect(fn).toContain("error: 'სერვერის შეცდომა'");
  });
});
