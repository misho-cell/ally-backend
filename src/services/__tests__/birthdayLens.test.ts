jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { parseMonthDay, daysUntil, getUpcomingBirthdays } from '../birthdayLens.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
});

// People write dates the way they say them. A reminder on the wrong day is
// worse than no reminder, so anything unrecognised returns null.
describe('parseMonthDay', () => {
  it.each([
    ['1978-12-11', 12, 11],
    ['11.12', 12, 11],
    ['11/12/1978', 12, 11],
    ['11 დეკემბერი', 12, 11],
    ['დაბადების დღე — 11 დეკემბერს', 12, 11],
    ['11 December', 12, 11],
    ['Dec 11', 12, 11],
  ])('reads %s', (input, month, day) => {
    expect(parseMonthDay(input)).toEqual({ month, day });
  });

  it.each([
    ['ზამთარში', 'no numbers'],
    ['45.99', 'impossible'],
    ['', 'empty'],
  ])('refuses to guess: %s (%s)', (input) => {
    expect(parseMonthDay(input)).toBeNull();
  });
});

describe('daysUntil', () => {
  const march10 = new Date(Date.UTC(2026, 2, 10));

  it('is 0 on the day itself', () => {
    expect(daysUntil({ month: 3, day: 10 }, march10)).toBe(0);
  });

  it('counts forward within the year', () => {
    expect(daysUntil({ month: 3, day: 15 }, march10)).toBe(5);
  });

  it('rolls into next year for a date already past', () => {
    // The whole point: a birthday in January is NEXT January, not -60 days.
    expect(daysUntil({ month: 1, day: 9 }, march10)).toBe(305);
  });
});

describe('getUpcomingBirthdays', () => {
  it('reads only the searcher OWN saved facts, never another member profile', async () => {
    await getUpcomingBirthdays('501');

    const sql = mockQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain('cf.submitted_by_user_id = $2');
    // The User.birthday column holds 2,726 members' own dates; surfacing those
    // to whoever has them in a phonebook is a disclosure nobody authorised.
    expect(sql).not.toContain('u.birthday');
  });

  it('returns only what falls inside the window, soonest first', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { phone: '+995599000001', name: 'გვიანი', value: '01-09' },
        { phone: '+995599000002', name: 'მალე', value: '15.03' },
      ],
      rowCount: 2,
    } as never);

    const out = await getUpcomingBirthdays('501', 30, new Date(Date.UTC(2026, 2, 10)));

    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('მალე');
    expect(out[0].days_until).toBe(5);
  });

  it('drops a date it cannot read rather than inventing one', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ phone: '+995599000003', name: 'უცნობი', value: 'ზაფხულში სადღაც' }],
      rowCount: 1,
    } as never);

    expect(await getUpcomingBirthdays('501')).toEqual([]);
  });
});
