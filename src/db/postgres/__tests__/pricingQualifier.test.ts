import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Ticket 20 row 133 — D14: one price everywhere, no qualifier.
 *
 * „Pro — $19.99/month (the Georgian tier)" implies there is another price for
 * somebody else, which is the thing D14 exists to prevent.
 *
 * THIS TEST EXISTS BECAUSE THE FIX REGRESSED BY COPY-PASTE, TWICE. The phrase
 * was seeded in migration 060 and B85 corrected the live row. Then 128 (the
 * Stripe rewrite) and 132 (the weekly token window) each rewrote the whole
 * pricing pack starting from the previous text, and carried the qualifier back
 * with it. Neither was about pricing wording at all.
 *
 * So the rule is asserted where the next person will meet it: a correction
 * that lives only in a database row is one careless paste from being undone.
 */

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

/**
 * The three that already ran and are history.
 *
 * Grandfathered by name rather than by a rule about numbers. A migration that
 * has been applied is a record of what happened; editing it would change
 * nothing live and would falsify that record. Listing them is also the
 * evidence for why this test is here.
 */
const ALREADY_APPLIED_WITH_THE_PHRASE: ReadonlySet<string> = new Set([
  '060_netai_info.sql',
  '128_pricing_fact_stripe.sql',
  '132_pricing_fact_weekly.sql',
]);

/**
 * The migration that removes the phrase, which has to name it to remove it.
 *
 * Its own entry rather than a place on the list above, because the reason is
 * the opposite one: those three PUT the phrase in and are history, this one
 * takes it out and is the fix. A single list would have read as "four
 * migrations we are not going to look at".
 */
const REMOVES_THE_PHRASE = '154_pricing_no_qualifier.sql';

const FORBIDDEN = [/the Georgian tier/i, /ქართული ტარიფი/];

describe('D14 — a price carries no qualifier', () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));

  it('finds the migrations to scan', () => {
    // A test that silently scanned nothing would pass forever.
    expect(files.length).toBeGreaterThan(50);
  });

  it('no new migration reinstates the qualifier', () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (ALREADY_APPLIED_WITH_THE_PHRASE.has(file) || file === REMOVES_THE_PHRASE) continue;
      // Comments are stripped: the rule is about what a migration WRITES, not
      // about what it explains. A future migration should be free to say in a
      // comment why the qualifier is gone.
      const body = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n');
      if (FORBIDDEN.some((re) => re.test(body))) offenders.push(file);
    }
    // If this fails on a migration you are writing: you copied the pricing
    // pack forward from 128 or 132. Remove the four words rather than adding
    // your file to the list above.
    expect(offenders).toEqual([]);
  });

  it('the correction really does remove it', () => {
    // Without this, 154 could be renamed, emptied or edited into a no-op and
    // its exemption above would quietly turn into a blind spot.
    const sql = readFileSync(join(MIGRATIONS_DIR, REMOVES_THE_PHRASE), 'utf8');
    expect(sql).toMatch(/UPDATE netai_info/);
    expect(sql).toMatch(/replace\(content, ' \(the Georgian tier\)', ''\)/);
  });

  it('the three historical ones really do contain it, so the list is not stale', () => {
    // A grandfather list that no longer matches reality quietly widens the
    // hole it was cut for.
    for (const file of ALREADY_APPLIED_WITH_THE_PHRASE) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      expect(sql).toMatch(/the Georgian tier/i);
    }
  });
});
