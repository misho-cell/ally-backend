import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ROW 101, THE HALF `previous_endpoint` CANNOT REACH.
 *
 * A notification goes to EVERY row in `push_subscriptions` for a person, so a
 * row left behind by a browser that no longer exists doubles every
 * notification. `previous_endpoint` handles the browser that is still running
 * when its endpoint rotates: it names the row it replaces. **It can never
 * reach a row written before it**, because the browser that wrote that one may
 * never come back — an old install, a deleted home-screen app.
 *
 * ⚠️ AND THE SERVER CANNOT WORK OUT WHICH ROWS THOSE ARE. Fourteen days of
 * `push_deliveries`, read per endpoint per day on 24 September:
 *
 *     failed = 0   on every endpoint, every day
 *
 * including two endpoints that had visibly stopped existing. Apple and Google
 * accept a push to a dead address and answer „delivered". A row only dies on a
 * 404 or a 410 and they never send one.
 *
 * So the only witness is the browser itself, and the only thing worth recording
 * is WHEN IT LAST TURNED UP. These tests pin that, and pin the two ways the
 * reading of it could silence a real person's phone.
 */
const SERVICE = readFileSync(join(__dirname, '..', 'notification.service.ts'), 'utf8');
const MIGRATION = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    'db',
    'postgres',
    'migrations',
    '176_push_subscription_last_seen.sql',
  ),
  'utf8',
);
const TOOL = readFileSync(join(__dirname, '..', '..', '..', 'scripts', 'ops', 'push.sh'), 'utf8');

describe('the browser saying „I am still here"', () => {
  it('is written on a first registration', () => {
    const insert = SERVICE.slice(SERVICE.indexOf('INSERT INTO push_subscriptions'));

    expect(insert.slice(0, 200)).toContain('last_seen_at');
    expect(insert.slice(0, 200)).toContain('NOW()');
  });

  /**
   * The re-post is the ONLY one that matters. A browser that already has a
   * subscription sends the same endpoint, so the row is reached through the
   * conflict branch and nowhere else — a stamp written only on insert would
   * record the day the row was born and never move again.
   */
  it('is written again every time the same browser re-posts', () => {
    const conflict = SERVICE.slice(SERVICE.indexOf('ON CONFLICT (endpoint) DO UPDATE'));

    expect(conflict.slice(0, 1200)).toContain('last_seen_at = NOW()');
  });

  /**
   * Unlike `device_id` and `user_agent` beside it, which are COALESCEd so a
   * re-post without them cannot erase what is known. A timestamp has the
   * opposite requirement: the newest claim is the true one.
   */
  it('is not COALESCEd — the point is that it moves', () => {
    const conflict = SERVICE.slice(SERVICE.indexOf('ON CONFLICT (endpoint) DO UPDATE'));
    const line = conflict
      .slice(0, 1200)
      .split('\n')
      .find((l) => l.includes('last_seen_at'));

    expect(line).toBeDefined();
    expect(line).not.toContain('COALESCE');
  });
});

describe('the column starts where the row started, not where the migration ran', () => {
  /**
   * Seeding from NOW() would stamp every existing row with the minute the
   * migration ran — erasing the exact difference the column exists to record,
   * on precisely the four rows it was built for.
   */
  it('backfills from created_at', () => {
    expect(MIGRATION).toContain('SET last_seen_at = created_at');
    expect(MIGRATION).not.toMatch(/SET last_seen_at = NOW\(\)/);
  });
});

describe('the rule that reads it cannot delete somebody’s only phone', () => {
  const CLAIMS = TOOL.slice(TOOL.indexOf('if [ "$WHO" = claims ]'));

  /**
   * ⚠️ THE ONE CLAUSE THE WHOLE THING RESTS ON. „Not claimed lately" alone is
   * not evidence: it is equally consistent with „that browser is gone" and
   * with „the client only posts on a NEW subscription, so no row is ever
   * re-stamped". The second reading would make EVERY row look dead.
   *
   * Requiring that ANOTHER row of the SAME PERSON was claimed inside the
   * window proves claims arrive for them at all. The evidence has to come from
   * the same person, because that is the only place it cannot be wrong.
   */
  it('calls a row stale only when the same person claimed a different row', () => {
    expect(CLAIMS).toContain('person_reports');
    expect(CLAIMS).toMatch(/if quiet and person_reports:/);
  });

  it('says PROVES NOTHING when the whole account is silent', () => {
    expect(CLAIMS).toContain('PROVES NOTHING');
  });

  /** It is a read. The deletion is a migration a person decides on (D44, §36). */
  it('deletes nothing itself', () => {
    expect(CLAIMS).not.toMatch(/DELETE\s+FROM/i);
    expect(CLAIMS).toContain('§36');
  });

  /**
   * „Could not look" and „looked and found nothing" are different facts, and
   * the exit code is where that distinction survives being piped somewhere.
   */
  it('exits 2 when the read-only window did not answer', () => {
    expect(CLAIMS).toContain('raise SystemExit(2)');
  });
});
