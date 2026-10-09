/**
 * 2080 (D716), the revert of 774ef2f on 9 October: `GET /updates/count` threw
 * „operator does not exist: integer = text" on every call for five and a half
 * hours. pending_updates.user_id is TEXT and threads.user_id is INTEGER, and
 * one parameter was compared with both. The unit test mocked `query`, so it
 * passed with the bug in place; only Postgres can say this.
 *
 * Skipped unless PG_INTEGRATION=1; `scripts/ops/malformed.sh` builds both
 * tables from the repo's own migrations and runs this file.
 */
import pool, { query } from '../../db/postgres/client';
import { countFollowedUpdates } from '../followUp.service';

const maybeDescribe = process.env.PG_INTEGRATION === '1' ? describe : describe.skip;

const OWNER = '90071';
const THE_OLD_SQL = `SELECT (SELECT COUNT(*)::int FROM pending_updates p
                              WHERE p.user_id = $1 AND p.followed_at IS NOT NULL)
                          + (SELECT COUNT(*)::int FROM threads t
                              WHERE t.user_id = $1 AND t.followed_at IS NOT NULL) AS n`;

maybeDescribe('the flagged count, on a real Postgres', () => {
  beforeAll(async () => {
    await query(`DELETE FROM pending_updates WHERE user_id = $1`, [OWNER]);
    await query(`DELETE FROM threads WHERE user_id = $1::int`, [OWNER]);
    await query(
      `INSERT INTO threads (user_id, type, title, followed_at) VALUES ($1::int, 'regular', 'flagged', NOW())`,
      [OWNER],
    );
  });

  afterAll(async () => {
    await query(`DELETE FROM threads WHERE user_id = $1::int`, [OWNER]);
    await pool.end();
  });

  it('the old shape really threw — the bug was real', async () => {
    await expect(query(THE_OLD_SQL, [OWNER])).rejects.toThrow(/integer = text/u);
  });

  it('counts a flagged conversation and does not throw', async () => {
    await expect(countFollowedUpdates(OWNER)).resolves.toBe(1);
  });
});
