import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { MAIN_MODEL, QUICK_MODEL } from '../aiModels';

/**
 * A model without rates is booked at $0: no spend in the books, no wallet
 * charge, and the test seats' daily budget never trips (12 Nov). Every model a
 * route runs on must have all four of its rates seeded in a migration.
 */
const MIGRATIONS_DIR = join(__dirname, '../../db/postgres/migrations');
const RATE_LINES = ['input_mtok', 'output_mtok', 'cache_read_mtok', 'cache_write_mtok'] as const;

function allMigrationText(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name: string) => name.endsWith('.sql'))
    .map((name: string) => readFileSync(join(MIGRATIONS_DIR, name), 'utf8'))
    .join('\n');
}

describe('the rates of the models we run', () => {
  const migrations = allMigrationText();

  it.each([MAIN_MODEL, QUICK_MODEL])('%s has all four rates seeded', (model: string) => {
    for (const line of RATE_LINES) {
      expect(migrations).toContain(`'anthropic.${model}.${line}'`);
    }
  });
});
