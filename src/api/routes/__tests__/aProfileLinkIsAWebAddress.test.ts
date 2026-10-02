import { readFileSync } from 'fs';
import { join } from 'path';
import { body, validationResult } from 'express-validator';

/**
 * Board #504 (Ninia): a link could not be added to the profile. It is now one
 * editable field, `link`, stored in its own column and accepted only as an
 * http(s) address. Source assertions for the route (this repository has no
 * supertest — see anAvatarIsServedBackAsWhatItSaid), and the rule itself run.
 */
const routes = readFileSync(join(__dirname, '..', 'profile.routes.ts'), 'utf8');

describe('the profile link', () => {
  it('is an editable field with its own column, and is read back', () => {
    expect(routes).toContain("{ key: 'link', column: 'profile_link', maxLen: MAX_LINK_CHARS }");
    expect(routes).toContain('u.profile_link AS link');
  });

  async function accepts(value: unknown): Promise<boolean> {
    const req = { body: { link: value } };
    await body('link')
      .optional({ nullable: true })
      .isString()
      .trim()
      .isLength({ max: 300 })
      .isURL({ protocols: ['http', 'https'], require_protocol: true })
      .run(req);
    return validationResult(req).isEmpty();
  }

  it('takes a web address and a null that clears it', async () => {
    expect(await accepts('https://www.linkedin.com/in/someone')).toBe(true);
    expect(await accepts(null)).toBe(true);
  });

  it('refuses anything that is not an http(s) address', async () => {
    expect(await accepts('javascript:alert(1)')).toBe(false);
    expect(await accepts('linkedin.com/in/someone')).toBe(false);
    expect(await accepts('just words')).toBe(false);
  });
});
