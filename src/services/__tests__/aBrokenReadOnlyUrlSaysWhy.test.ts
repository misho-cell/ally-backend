const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

import { createHash, createHmac, pbkdf2Sync } from 'crypto';
import { describeRoUrl, md5Matches, roUrlStatus, scramMatches } from '../roUrlStatus.service';
import { parseRoUrl } from '../roUrl';

/**
 * 24 Oct: the read-only window said „password authentication failed" after the
 * secret rotation. The status says which part of DATABASE_RO_URL is wrong,
 * and never the URL itself.
 */
const MAIN = { host: 'db.example.net', port: '5432', database: 'netai' } as const;
const PASSWORD = 'a1b2c3d4e5f6';
const SALT = Buffer.from('fixed-test-salt!');
const ITERATIONS = 4096;

function scramOf(password: string): string {
  const salted = pbkdf2Sync(password, SALT, ITERATIONS, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();
  return `SCRAM-SHA-256$${ITERATIONS}:${SALT.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

const GOOD_URL = `postgresql://claude_readonly:${PASSWORD}@db.example.net:5432/netai`;

beforeEach(() => {
  mockQuery.mockReset();
});

describe('the read-only URL status', () => {
  it('agrees with the main connection and never carries the password', () => {
    const status = describeRoUrl(GOOD_URL, MAIN);
    expect(status).toMatchObject({
      configured: true,
      scheme: 'postgresql',
      host_part_shape: 'x.x.x:x/x',
      parses: true,
      quoted: false,
      user: 'claude_readonly',
      same_host_as_main: true,
      same_port_as_main: true,
      same_db_as_main: true,
      password_set: true,
      password_url_safe: true,
    });
    expect(JSON.stringify(status)).not.toContain(PASSWORD);
  });

  it('names a different host and a password that breaks the URL', () => {
    const status = describeRoUrl(
      'postgresql://claude_readonly:ab#cd@old.example.net:5432/netai',
      MAIN,
    );
    expect(status.password_url_safe).toBe(false);
    expect(
      describeRoUrl('postgresql://claude_readonly:x@old.example.net/netai', MAIN).same_host_as_main,
    ).toBe(false);
  });

  it('says when the value is missing or wrapped in quotes', () => {
    expect(describeRoUrl(undefined, MAIN)).toMatchObject({ configured: false, parses: false });
    expect(describeRoUrl(`"${GOOD_URL}"`, MAIN).quoted).toBe(true);
  });

  it('checks the password against the stored SCRAM and md5 verifiers', () => {
    expect(scramMatches(PASSWORD, scramOf(PASSWORD))).toBe(true);
    expect(scramMatches('other', scramOf(PASSWORD))).toBe(false);
    const md5 =
      'md5' +
      createHash('md5')
        .update(PASSWORD + 'claude_readonly')
        .digest('hex');
    expect(md5Matches(PASSWORD, 'claude_readonly', md5)).toBe(true);
    expect(md5Matches('other', 'claude_readonly', md5)).toBe(false);
  });

  it('reports whether the database holds this password', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ rolpassword: scramOf('rotated-elsewhere') }] });
    expect((await roUrlStatus(GOOD_URL, MAIN)).password_matches_db).toBe(false);
    mockQuery.mockResolvedValueOnce({ rows: [{ rolpassword: scramOf(PASSWORD) }] });
    expect((await roUrlStatus(GOOD_URL, MAIN)).password_matches_db).toBe(true);
  });

  it('leaves the match unknown when the main role may not read stored passwords', async () => {
    mockQuery.mockRejectedValueOnce(
      Object.assign(new Error('permission denied'), { code: '42501' }),
    );
    expect((await roUrlStatus(GOOD_URL, MAIN)).password_matches_db).toBeNull();
  });

  it('passes any other database error on', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection lost'));
    await expect(roUrlStatus(GOOD_URL, MAIN)).rejects.toThrow('connection lost');
  });

  it('reads a password that carries URL characters whole, to the last @', () => {
    const raw = 'p@ss/w#rd?x';
    expect(parseRoUrl(`postgresql://claude_readonly:${raw}@db.example.net:5432/netai`)).toEqual({
      user: 'claude_readonly',
      password: raw,
      host: 'db.example.net',
      port: '5432',
      database: 'netai',
    });
  });

  it('decodes a percent-escaped password and defaults the port', () => {
    expect(
      parseRoUrl('postgres://claude_readonly:a%40b@db.example.net/netai?sslmode=require'),
    ).toMatchObject({
      password: 'a@b',
      port: '5432',
      database: 'netai',
    });
  });

  it('reads a URL with no database path, as the live one is', () => {
    expect(parseRoUrl('postgresql://claude_readonly:a:b@db.example.net:5432')).toMatchObject({
      password: 'a:b',
      database: 'postgres',
    });
    expect(parseRoUrl('postgresql://claude_readonly:x@db.example.net/')?.database).toBe('postgres');
  });

  it('keeps a line break pasted into the password, as the database was given it', () => {
    expect(
      parseRoUrl('postgresql://claude_readonly:abc\n@db.example.net:5432/netai')?.password,
    ).toBe('abc\n');
  });
});
