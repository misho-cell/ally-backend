process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests';
process.env.NEO4J_HOST = 'localhost';
process.env.NEO4J_PORT = '7687';
process.env.NEO4J_USER = 'neo4j';
process.env.NEO4J_PASS = 'test';
// PG_INTEGRATION runs (searchPg.integration.test.ts) point at a REAL scratch
// Postgres via the caller's env — don't clobber it; unit tests keep the stubs.
if (process.env.PG_INTEGRATION !== '1') {
  process.env.POSTGRES_HOST = 'localhost';
  process.env.POSTGRES_PORT = '5432';
  process.env.POSTGRES_DB = 'test';
  process.env.POSTGRES_NAME = 'postgres';
  process.env.POSTGRES_PASS = 'test';
}
// Suites that import a module which reaches the Anthropic client mock the calls
// themselves; the key only has to exist so config/anthropic.ts stops refusing to
// load. Set unconditionally, so the suite is green or red for the same reason on
// every machine — and so a call that escaped its mock fails loudly on 401
// instead of quietly billing a real key.
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key-not-a-real-credential';
process.env.WHATSAPP_PHONE_ID = 'test-phone-id';
process.env.WHATSAPP_TOKEN = 'test-whatsapp-token';
