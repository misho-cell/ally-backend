import { readFileSync } from 'fs';
import { join } from 'path';
import { validationResult } from 'express-validator';
import { profileLinkRule } from '../../validators/profileLinkRule';

/**
 * Board #504 (Ninia): a link could not be added to the profile. It is now one
 * editable field, `link`, stored in its own column and accepted only as an
 * http(s) address. Source assertions for the route (this repository has no
 * supertest — see anAvatarIsServedBackAsWhatItSaid), and the rule itself run.
 */
const REFUSED = Symbol('refused');
const routes = readFileSync(join(__dirname, '..', 'profile.routes.ts'), 'utf8');

describe('the profile link', () => {
  it('is an editable field with its own column, and is read back', () => {
    expect(routes).toContain("{ key: 'link', column: 'profile_link', maxLen: MAX_LINK_CHARS }");
    expect(routes).toContain('u.profile_link AS link');
  });

  async function saved(value: unknown): Promise<unknown> {
    const req: { body: { link: unknown } } = { body: { link: value } };
    await profileLinkRule().run(req);
    return validationResult(req).isEmpty() ? req.body.link : REFUSED;
  }

  it('takes a web address and a null that clears it', async () => {
    expect(await saved('https://www.linkedin.com/in/someone')).toBe(
      'https://www.linkedin.com/in/someone',
    );
    expect(await saved(null)).toBeNull();
  });

  it('gives an address typed without a scheme https:// (frontend, 2 October)', async () => {
    expect(await saved('linkedin.com/in/someone')).toBe('https://linkedin.com/in/someone');
    expect(await saved('  www.example.ge ')).toBe('https://www.example.ge');
    expect(await saved('example.ge:8080/me')).toBe('https://example.ge:8080/me');
  });

  it('refuses anything that is not an http(s) address', async () => {
    expect(await saved('javascript:alert(1)')).toBe(REFUSED);
    expect(await saved('JavaScript:alert(1)')).toBe(REFUSED);
    expect(await saved('mailto:someone@example.ge')).toBe(REFUSED);
    expect(await saved('just words')).toBe(REFUSED);
    expect(await saved('')).toBe(REFUSED);
  });
});
