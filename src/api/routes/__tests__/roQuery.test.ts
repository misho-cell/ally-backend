import { isReadOnlySql } from '../roQuery.routes';

describe('isReadOnlySql', () => {
  it.each([
    'SELECT 1',
    'select id, name from "User" where id = 501',
    '  WITH s AS (SELECT 1) SELECT * FROM s  ',
    'SELECT COUNT(*) FROM threads;',
    'EXPLAIN SELECT 1',
  ])('accepts: %s', (sql) => {
    expect(isReadOnlySql(sql)).toBe(true);
  });

  it.each([
    '',
    'UPDATE "User" SET name = NULL',
    'DELETE FROM threads',
    'INSERT INTO threads DEFAULT VALUES',
    'DROP TABLE threads',
    'TRUNCATE conversations',
    "ALTER ROLE claude_readonly PASSWORD 'x'",
    // Statement chaining must be refused even when it starts with SELECT.
    'SELECT 1; DELETE FROM threads',
    'SELECT 1;;DROP TABLE threads;',
    // COPY can write files server-side.
    "COPY threads TO '/tmp/x'",
  ])('rejects: %s', (sql) => {
    expect(isReadOnlySql(sql)).toBe(false);
  });

  it('rejects oversized statements', () => {
    expect(isReadOnlySql(`SELECT '${'a'.repeat(6000)}'`)).toBe(false);
  });
});
