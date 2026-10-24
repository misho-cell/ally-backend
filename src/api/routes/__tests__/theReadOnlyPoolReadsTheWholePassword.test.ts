const mockPool = jest.fn();
jest.mock('pg', () => ({
  Pool: function Pool(config: unknown) {
    mockPool(config);
    return { query: jest.fn().mockResolvedValue({ rows: [] }) };
  },
}));

import { Request, Response } from 'express';
import { adminReadOnlyQuery } from '../roQuery.routes';

/**
 * 24 Oct: the rotated read-only password carries characters a URL parser
 * cuts at, so the database was handed a different password than the one in
 * DATABASE_RO_URL. The pool now gets the parts, the password whole.
 */
const ORIGINAL_URL = process.env.DATABASE_RO_URL;
const RAW_PASSWORD = 'p@ss/w#rd';

afterAll(() => {
  process.env.DATABASE_RO_URL = ORIGINAL_URL;
});

it('hands the database the password as written in the URL', async () => {
  process.env.DATABASE_RO_URL = `postgresql://claude_readonly:${RAW_PASSWORD}@db.example.net:6543/netai`;
  const res = { status: () => res, json: () => res } as unknown as Response;
  await adminReadOnlyQuery({ body: { sql: 'SELECT 1' } } as Request, res);
  expect(mockPool).toHaveBeenCalledWith(
    expect.objectContaining({
      host: 'db.example.net',
      port: 6543,
      database: 'netai',
      user: 'claude_readonly',
      password: RAW_PASSWORD,
    }),
  );
});
