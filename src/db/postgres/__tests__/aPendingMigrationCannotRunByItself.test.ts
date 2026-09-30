import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * ⚠️ A MIGRATION IN `pending/` MUST STAY OUT OF THE RUNNER'S REACH.
 *
 * `runMigrations` reads the migrations directory and applies every `.sql` file
 * in it, in one transaction, on every boot. A migration that changes a function
 * used by an expression index cannot be deployed alone — between the deploy and
 * the REINDEX the index holds one function's output while every query computes
 * another's, and for the rows that differ search silently stops matching.
 *
 * `pending/` is where such a migration waits for the person who will run the
 * REINDEX. This test is the guard on that arrangement: the runner ignores the
 * folder only because `readdir` is not recursive and the filter is `.sql`, and
 * both of those are one small edit away from being untrue.
 */
describe('a migration parked in pending/ cannot run by itself', () => {
  const dir = join(__dirname, '..', 'migrations');

  it('is invisible to the filter the runner uses', () => {
    const picked = readdirSync(dir).filter((f) => f.endsWith('.sql'));

    expect(picked).not.toContain('pending');
    for (const name of readdirSync(join(dir, 'pending'))) {
      expect(picked).not.toContain(name);
    }
  });

  /** The runner must stay non-recursive; a `withFileTypes` walk would break it. */
  it('is not read recursively by the runner', () => {
    const runner = readFileSync(join(__dirname, '..', 'migrate.ts'), 'utf8');

    expect(runner).toContain('readdir(MIGRATIONS_DIR)');
    expect(runner).not.toContain('recursive');
  });

  /**
   * A file parked here without its commands is a file nobody can safely run.
   * Each one must name the exact REINDEX it needs, so scheduling it is reading
   * rather than reconstructing.
   */
  it('every parked migration names the commands that must run with it', () => {
    const parked = readdirSync(join(dir, 'pending')).filter((f) => f.endsWith('.sql'));

    // Empty is allowed: 184 was scheduled on 30 September and nothing else waits.
    for (const file of parked) {
      const sql = readFileSync(join(dir, 'pending', file), 'utf8');
      expect(sql).toMatch(/REINDEX INDEX CONCURRENTLY/);
    }
  });
});
