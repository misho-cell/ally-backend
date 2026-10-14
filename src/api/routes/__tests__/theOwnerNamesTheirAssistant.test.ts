import { readFileSync } from 'fs';
import { join } from 'path';
import { ASSISTANT_NAME_MAX_CHARS, profileFieldValue } from '../profile.routes';

const routes = readFileSync(join(__dirname, '..', 'profile.routes.ts'), 'utf8');
const migration = readFileSync(
  join(__dirname, '..', '..', '..', 'db', 'postgres', 'migrations', '240_assistant_name.sql'),
  'utf8',
);

/** The frontend's item 3 (Misho's yes, 14 Oct): „ჩემი ასისტენტი" — the owner names their assistant. */
describe('the owner names their own assistant', () => {
  it('is read on GET /profile and written by PATCH /profile', () => {
    expect(routes).toContain('u.assistant_name,');
    expect(routes).toContain(
      "{ key: 'assistant_name', column: 'assistant_name', maxLen: ASSISTANT_NAME_MAX_CHARS },",
    );
    expect(routes).toContain("body('assistant_name')");
  });

  it('keeps a name trimmed and within its limit', () => {
    expect(profileFieldValue('assistant_name', '  ნეტა  ', ASSISTANT_NAME_MAX_CHARS)).toBe('ნეტა');
    expect(
      profileFieldValue('assistant_name', 'ა'.repeat(60), ASSISTANT_NAME_MAX_CHARS)?.length,
    ).toBe(ASSISTANT_NAME_MAX_CHARS);
    expect(migration).toContain(`length(assistant_name) <= ${ASSISTANT_NAME_MAX_CHARS}`);
  });

  it('goes back to the default on an empty name or null', () => {
    expect(profileFieldValue('assistant_name', '   ', ASSISTANT_NAME_MAX_CHARS)).toBeNull();
    expect(profileFieldValue('assistant_name', null, ASSISTANT_NAME_MAX_CHARS)).toBeNull();
  });

  it('still never clears the owner’s own name', () => {
    expect(profileFieldValue('name', '', 80)).toBeUndefined();
    expect(profileFieldValue('name', null, 80)).toBeUndefined();
    expect(profileFieldValue('employer', '', 120)).toBe('');
  });
});
