import { readFileSync } from 'fs';
import { join } from 'path';
import { Warmth } from '../contactPage.service';
import { tierForWarmth } from '../contactOwnerSettings.service';

jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

const service = readFileSync(join(__dirname, '..', 'contactOwnerSettings.service.ts'), 'utf8');
const page = readFileSync(join(__dirname, '..', 'contactPage.service.ts'), 'utf8');
const routes = readFileSync(
  join(__dirname, '..', '..', 'api', 'routes', 'contacts.routes.ts'),
  'utf8',
);

/** The frontend's item 3 (Misho's yes, 14 Oct): warmth, own labels, exclusion by goal. */
describe('the contact page keeps the owner’s own choices', () => {
  it('writes warmth as the hand-set tier the page and the searches read back', () => {
    expect(tierForWarmth(Warmth.Warm)).toBe('green');
    expect(tierForWarmth(Warmth.Neutral)).toBe('yellow');
    expect(tierForWarmth(Warmth.Distant)).toBe('red');
  });

  it('keeps the tier it replaced, so „back to inferred" restores it', () => {
    expect(service).toContain('keepsOriginal ? existing.replaced_tier : existing.tier');
    expect(service).toContain('SET tier = replaced_tier');
    expect(service).toContain(
      'if (existing === null || existing.source !== PAGE_TIER_SOURCE) return;',
    );
  });

  it('keeps the owner’s labels apart from the import’s, and removes only those', () => {
    expect(service).toContain("const OWN_LABEL_SOURCE = 'USER_CREATED';");
    expect(service).toMatch(/DELETE FROM "UserTags"[\s\S]*AND tag = \$3 AND source = \$4/u);
    expect(page).toContain('own_labels: ownWritten,');
    // Tester box 59368: an untyped $3 in the select list and a comparison was a 500.
    expect(service).toContain('SELECT $1::int, $2::varchar, $3::varchar, 1, $4::"TagSource"');
  });

  it('excludes from one goal of the owner’s, by its id, stored by digits as the page reads it', () => {
    expect(service).toContain("'SELECT title FROM tasks WHERE id = $1 AND user_id = $2 LIMIT 1'");
    expect(service).toContain('[userId, phoneDigits(phone), title, goalId],');
    expect(page).toContain('SELECT id, excluded_for, reason, goal_id FROM contact_exclusions');
  });

  it('is four routes behind the contact-ownership check', () => {
    for (const route of [
      "'/:id/warmth'",
      "'/:id/labels'",
      "'/:id/labels/:label'",
      "'/:id/exclusions'",
    ]) {
      expect(routes).toContain(route);
    }
    expect(routes).toContain("withOwnContact('PUT /contacts/:id/warmth'");
  });
});
