/**
 * D752 on a real Postgres: threads.user_id is INTEGER and user_profile_kv.user_id
 * is TEXT — the same pair that broke /updates/count on 9 October (2080). The
 * join is read here, not mocked. Skipped unless PG_INTEGRATION=1; run by
 * `scripts/ops/malformed.sh`.
 */
import pool, { query } from '../../db/postgres/client';
import { saveLanguagePreference, threadLanguagePreference } from '../languagePreference';

const maybeDescribe = process.env.PG_INTEGRATION === '1' ? describe : describe.skip;

const OWNER = '90072';

maybeDescribe('the language request, on a real Postgres', () => {
  let threadId = 0;

  beforeAll(async () => {
    await query(`DELETE FROM user_profile_kv WHERE user_id = $1`, [OWNER]);
    const made = await query<{ id: number }>(
      `INSERT INTO threads (user_id, type, title) VALUES ($1::int, 'regular', 'lang') RETURNING id`,
      [OWNER],
    );
    threadId = made.rows[0].id;
  });

  afterAll(async () => {
    await query(`DELETE FROM user_profile_kv WHERE user_id = $1`, [OWNER]);
    await query(`DELETE FROM threads WHERE user_id = $1::int`, [OWNER]);
    await pool.end();
  });

  it('is nothing before it is asked', async () => {
    await expect(threadLanguagePreference(threadId)).resolves.toBeNull();
  });

  it('is read through the thread once asked, and replaced by the next request', async () => {
    await saveLanguagePreference(OWNER, 'en');
    await expect(threadLanguagePreference(threadId)).resolves.toBe('en');
    await saveLanguagePreference(OWNER, 'ka');
    await expect(threadLanguagePreference(threadId)).resolves.toBe('ka');
  });
});
