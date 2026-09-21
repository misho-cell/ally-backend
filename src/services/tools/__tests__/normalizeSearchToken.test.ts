import { readFileSync } from 'fs';
import { join } from 'path';

import {
  FOLDS,
  GEORGIAN_LETTERS,
  LATIN_LETTERS,
  normalizeSearchToken,
} from '../normalizeSearchToken';

/** The migration that owns the rule the TypeScript copy has to agree with. */
const NORMALIZE_SQL = join(
  __dirname,
  '..',
  '..',
  '..',
  'db',
  'postgres',
  'migrations',
  '043_normalize_georgian.sql',
);

/**
 * The point of this file: the TypeScript copy is only safe while it says what
 * the database says. So the SQL is read and compared, rather than trusted.
 *
 * This is the lesson of row 232, applied before it costs anything: there I
 * wrote a status the table's CHECK did not allow, having never read the CHECK,
 * and the fix shipped and did nothing. A literal that must agree with the
 * database is held against the database's own text.
 */
describe('normalizeSearchToken mirrors migration 043', () => {
  const sql = readFileSync(NORMALIZE_SQL, 'utf8');

  it('uses the alphabet and the Latin letters the SQL translates to', () => {
    const translate = /translate\(lower\(coalesce\(input, ''\)\),\s*'([^']+)',\s*'([^']+)'\)/.exec(
      sql,
    );
    expect(translate).not.toBeNull();
    expect(translate?.[1]).toBe(GEORGIAN_LETTERS);
    expect(translate?.[2]).toBe(LATIN_LETTERS);
  });

  it('maps one Latin letter per Georgian letter', () => {
    expect([...GEORGIAN_LETTERS]).toHaveLength([...LATIN_LETTERS].length);
  });

  it('applies the same folds, in the same order', () => {
    // The replaces nest, and the arguments of the INNERMOST one are written
    // first — so the order the pairs appear in the text is the order the
    // database applies them in.
    const asApplied = [...sql.matchAll(/,\s*'([a-z]{1,2})',\s*'([a-z])'\)/g)].map(
      (match) => [match[1], match[2]] as const,
    );
    expect(asApplied).toEqual(FOLDS.map(([from, to]) => [from, to]));
  });
});

describe('normalizeSearchToken', () => {
  /**
   * The values in this table were READ BACK from the live function on
   * 21 September, not predicted from the SQL — a transcription of the rule
   * that agrees with itself would still pass.
   */
  const MEASURED: readonly (readonly [string, string])[] = [
    ['santexniki', 'santekniki'],
    ['santekhniki', 'santekniki'],
    ['santexniqi', 'santekniki'],
    ['სანთეხნიქი', 'santekniki'],
    ['სანტეხნიქი', 'santekniki'],
    ['სანთეხნიკი', 'santekniki'],
    ['accountant', 'accountant'],
    ['atstsountant', 'accountant'],
    ['აცცოუნთანთ', 'accountant'],
    ['აწწოუნტანტ', 'accountant'],
    ['marketing', 'marketing'],
    ['marqeting', 'marketing'],
    ['მარქეთინგ', 'marketing'],
    ['მარკეტინგ', 'marketing'],
    ['advokati', 'advokati'],
    ['ადვოქათი', 'advokati'],
    ['photographer', 'photographer'],
    ['fhotografher', 'fhotografher'],
    ['ფოთოგრაფერ', 'fotografer'],
    ['ფოტოღრაფერ', 'fotografer'],
  ];

  it.each(MEASURED)('%s normalizes to %s, as the database does', (input, expected) => {
    expect(normalizeSearchToken(input)).toBe(expected);
  });

  it('keeps a term that normalizes to something of its own distinct', () => {
    // photographer's Georgian reading folds ph to f and the Latin drift does
    // not, so that one IS a second pattern and must not be deduplicated away.
    expect(normalizeSearchToken('photographer')).not.toBe(normalizeSearchToken('ფოტოგრაფერ'));
  });
});
