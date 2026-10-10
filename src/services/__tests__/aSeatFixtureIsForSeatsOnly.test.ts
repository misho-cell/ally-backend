import { query } from '../../db/postgres/client';
import {
  FixtureOutcome,
  writeAnswerRecord,
  writeOldProfile,
  writeStaleFact,
} from '../seatFixtures.service';

jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

const mockQuery = query as jest.MockedFunction<typeof query>;
const SEAT = 182200;

/** Tester 49567: 1690's stale fact and 1691's answer record, on fictional seats only. */
describe('the stale-fact fixture (1690)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes the seat’s own fact, dated back, on its own contact', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: SEAT }] } as never)
      .mockResolvedValueOnce({ rows: [{ found: true }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    await expect(
      writeStaleFact(SEAT, {
        phone: '+995 500 000 009',
        fieldType: 'employer',
        value: 'Acme',
        daysAgo: 200,
      }),
    ).resolves.toBe(FixtureOutcome.Written);
    const [sql, params] = mockQuery.mock.calls[2];
    expect(String(sql)).toContain('NOW() - make_interval(days => $5)');
    expect(String(sql)).toContain('confirm_asked_at = NULL');
    expect(params).toEqual(['+995500000009', String(SEAT), 'employer', 'Acme', 200]);
  });

  it('refuses a real person before reading anything else', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await expect(
      writeStaleFact(501, {
        phone: '+995500000009',
        fieldType: 'employer',
        value: 'x',
        daysAgo: 200,
      }),
    ).resolves.toBe(FixtureOutcome.NotATestSeat);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('refuses a number that is not the seat’s contact, and a field that is not a core one', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: SEAT }] } as never)
      .mockResolvedValueOnce({ rows: [{ found: false }] } as never);
    await expect(
      writeStaleFact(SEAT, {
        phone: '+995500000009',
        fieldType: 'city',
        value: 'Batumi',
        daysAgo: 400,
      }),
    ).resolves.toBe(FixtureOutcome.NotTheSeatsContact);
    await expect(
      writeStaleFact(SEAT, {
        phone: '+995500000009',
        fieldType: 'hobby',
        value: 'x',
        daysAgo: 400,
      }),
    ).resolves.toBe(FixtureOutcome.BadInput);
  });
});

describe('the answer-record fixture (1691)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets the record under the field the goal files under', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: SEAT }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    await expect(
      writeAnswerRecord(SEAT, {
        goalText: 'კარგი ნოტარიუსი მჭირდება',
        asked: 10,
        yes: 8,
        no: 1,
        referred: 0,
        firstAnswerMinutesMedian: 12,
      }),
    ).resolves.toBe(FixtureOutcome.Written);
    const params = mockQuery.mock.calls[1][1] as unknown[];
    expect(params[0]).toBe(SEAT);
    expect(params.slice(2)).toEqual([10, 8, 1, 0, 12]);
  });

  it('refuses answers that add up to more than were asked', async () => {
    await expect(
      writeAnswerRecord(SEAT, {
        goalText: 'ნოტარიუსი',
        asked: 2,
        yes: 2,
        no: 1,
        referred: 0,
        firstAnswerMinutesMedian: null,
      }),
    ).resolves.toBe(FixtureOutcome.BadInput);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

/** Tester 49805 (4226): an old Ally profile on a contact, only when that contact is fictional too. */
describe('the old-profile fixture (4226)', () => {
  const CONTACT_SEAT = 182201;
  const INPUT = { phone: '+995 500 000 009', employer: 'Old Bank', jobPosition: 'Teller' };
  beforeEach(() => jest.clearAllMocks());

  it('writes the employer and title on the contact’s own fictional account', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: SEAT }] } as never)
      .mockResolvedValueOnce({ rows: [{ found: true }] } as never)
      .mockResolvedValueOnce({ rows: [{ user_id: CONTACT_SEAT }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    await expect(writeOldProfile(SEAT, INPUT)).resolves.toBe(FixtureOutcome.Written);
    const [sql, params] = mockQuery.mock.calls[3];
    expect(String(sql)).toContain('EXISTS (SELECT 1 FROM test_seats WHERE user_id = $1)');
    expect(params).toEqual([CONTACT_SEAT, 'Old Bank', 'Teller']);
  });

  it('never touches a real person’s profile', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: SEAT }] } as never)
      .mockResolvedValueOnce({ rows: [{ found: true }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    await expect(writeOldProfile(SEAT, INPUT)).resolves.toBe(FixtureOutcome.NotATestSeat);
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it('refuses a real seat, a stranger’s number, and an empty profile', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await expect(writeOldProfile(501, INPUT)).resolves.toBe(FixtureOutcome.NotATestSeat);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: SEAT }] } as never)
      .mockResolvedValueOnce({ rows: [{ found: false }] } as never);
    await expect(writeOldProfile(SEAT, INPUT)).resolves.toBe(FixtureOutcome.NotTheSeatsContact);
    await expect(
      writeOldProfile(SEAT, { phone: INPUT.phone, employer: ' ', jobPosition: '' }),
    ).resolves.toBe(FixtureOutcome.BadInput);
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });
});
