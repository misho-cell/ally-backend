jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
  __esModule: true,
}));
jest.mock('../stripe.service', () => ({
  __esModule: true,
  cancelSubscriptionsForCustomer: jest.fn().mockResolvedValue(0),
}));

import { userScrubAssignments } from '../privacyRights.service';

// The real "User" shape, trimmed to the columns this decision turns on.
const COLUMNS = [
  { column_name: 'name', is_nullable: 'NO', data_type: 'character varying' },
  { column_name: 'email', is_nullable: 'YES', data_type: 'text' },
  { column_name: 'birthday', is_nullable: 'YES', data_type: 'date' },
  { column_name: 'subscription_status', is_nullable: 'NO', data_type: 'character varying' },
  { column_name: 'subscription_tier', is_nullable: 'NO', data_type: 'character varying' },
];

function client(columns = COLUMNS): { query: jest.Mock } {
  return { query: jest.fn().mockResolvedValue({ rows: columns, rowCount: columns.length }) };
}

describe('userScrubAssignments (ticket 9 task 31.1)', () => {
  it('resets the subscription columns to their DEFAULT — an erased account is not a subscriber', async () => {
    const out = await userScrubAssignments(client() as never);

    expect(out.assignments).toContain('"subscription_status" = DEFAULT');
    expect(out.assignments).toContain('"subscription_tier" = DEFAULT');
    expect(out.skipped).toEqual([]);
  });

  it('still empties the personal columns the way it always did', async () => {
    const out = await userScrubAssignments(client() as never);

    // NOT NULL text is emptied, nullable is nulled.
    expect(out.assignments).toContain(`"name" = ''`);
    expect(out.assignments).toContain('"email" = NULL');
    expect(out.assignments).toContain('"birthday" = NULL');
  });

  it('touches nothing that the live table does not have', async () => {
    const out = await userScrubAssignments(client([]) as never);

    expect(out.assignments).toEqual([]);
  });
});
