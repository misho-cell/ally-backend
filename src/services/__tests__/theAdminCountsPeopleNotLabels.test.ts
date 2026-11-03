import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * DR11 (#8624, the tester's 81317): a new member was told 1,209 contacts while
 * the admin screen showed 1,223 — the screen counted saved labels, and a
 * person saved under two labels counted twice. The admin counts people, as
 * get_contact_count does.
 */
describe('the admin screen counts people, not labels', () => {
  const code = readFileSync(join(__dirname, '..', 'adminUsers.service.ts'), 'utf8');

  it('counts distinct phones in the list and on the profile', () => {
    expect(code).toContain(
      '(SELECT COUNT(DISTINCT ua.phone) FROM "UserAlias" ua WHERE ua."contactId" = u.id)',
    );
    expect(code).toContain(
      'SELECT COUNT(DISTINCT phone) AS count FROM "UserAlias" WHERE "contactId" = $1',
    );
    expect(code).not.toMatch(/COUNT\(\*\)[^']*"UserAlias"/u);
  });

  it('matches what the model is told', () => {
    const tool = readFileSync(join(__dirname, '..', 'tools', 'getContactCount.ts'), 'utf8');
    expect(tool).toContain(
      'SELECT COUNT(DISTINCT phone) AS count FROM "UserAlias" WHERE "contactId" = $1',
    );
  });
});
