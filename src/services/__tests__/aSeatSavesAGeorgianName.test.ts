import { query } from '../../db/postgres/client';
import { FixtureOutcome, writeGeorgianName } from '../seatFixtures.service';

jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

const mockQuery = query as jest.MockedFunction<typeof query>;
const SEAT = 186834;

/** #4654 (the tester's 64755): a fictional seat saves the Georgian spelling of a Latin contact. */
describe('the Georgian-name fixture', () => {
  beforeEach(() => jest.clearAllMocks());

  it('saves the seat’s own spelling, replacing an earlier one', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: SEAT }] } as never)
      .mockResolvedValueOnce({ rows: [{ found: true }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    await expect(
      writeGeorgianName(SEAT, { phone: '+995 500 000 009', georgianName: ' ცოტნე  ციცქიშვილი ' }),
    ).resolves.toBe(FixtureOutcome.Written);
    const [sql, params] = mockQuery.mock.calls[2];
    expect(String(sql)).toContain('UPDATE contact_facts SET retracted_at = NOW()');
    expect(params).toEqual(['+995500000009', String(SEAT), 'georgian_name', 'ცოტნე ციცქიშვილი']);
  });

  it('takes Georgian letters only, before reading anything', async () => {
    for (const georgianName of ['Tsotne', '', 'ცოტნე2', 'ც'.repeat(81)]) {
      await expect(writeGeorgianName(SEAT, { phone: '+995500000009', georgianName })).resolves.toBe(
        FixtureOutcome.BadInput,
      );
    }
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses a real account, and a number that is not the seat’s contact', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await expect(
      writeGeorgianName(501, { phone: '+995500000009', georgianName: 'ცოტნე' }),
    ).resolves.toBe(FixtureOutcome.NotATestSeat);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: SEAT }] } as never)
      .mockResolvedValueOnce({ rows: [{ found: false }] } as never);
    await expect(
      writeGeorgianName(SEAT, { phone: '+995500000009', georgianName: 'ცოტნე' }),
    ).resolves.toBe(FixtureOutcome.NotTheSeatsContact);
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });
});
