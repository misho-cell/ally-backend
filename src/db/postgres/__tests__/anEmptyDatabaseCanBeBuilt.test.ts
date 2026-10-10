import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS = join(__dirname, '..', 'migrations');
const BASE = '000_legacy_ally_base.sql';

/**
 * 4293 (plate NEW-2): the setup scripts could not build an empty database —
 * the old Ally tables were never created by any migration here. Checked by
 * hand on an empty Postgres 16 on 10 Oct: with this file first, the server's
 * own runner applies every migration in one transaction.
 */
describe('the legacy base migration', () => {
  const sql = readFileSync(join(MIGRATIONS, BASE), 'utf8');

  it('runs first', () => {
    const files = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    expect(files[0]).toBe(BASE);
  });

  it('creates the legacy tables the code uses, before the first migration that reads them', () => {
    for (const table of [
      '"User"',
      '"UserAlias"',
      '"UserPhone"',
      '"UserTags"',
      '"UserConnection"',
      'contact_insights',
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it('changes nothing on a database that already has them: every statement is guarded', () => {
    const body = sql.replace(/--[^\n]*\n/g, '\n');
    const blocks = body.match(/DO \$\$[\s\S]*?END \$\$;/g) ?? [];
    for (const block of blocks) expect(block).toContain('WHEN duplicate_object THEN NULL');
    const statements = body
      .replace(/DO \$\$[\s\S]*?END \$\$;/g, '')
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s !== '');
    for (const statement of statements) {
      expect(statement.startsWith('CREATE TABLE IF NOT EXISTS')).toBe(true);
    }
    expect(sql).not.toMatch(/\b(DROP|ALTER|DELETE|UPDATE|INSERT)\b/);
  });
});
