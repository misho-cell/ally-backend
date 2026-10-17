import { query } from '../../db/postgres/client';
import { FixtureOutcome, writeResearchFact } from '../seatFixtures.service';

jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

const mockQuery = query as jest.MockedFunction<typeof query>;
const SEAT = 187484;
/** A number from the fictional +1202555 range (fictionalNumbers.ts). */
const FICTIONAL = '+12025550150';
const fact = {
  phone: FICTIONAL,
  fieldType: 'occupation',
  value: 'ნოტარიუსი',
  status: 'possible',
  sourceUrl: 'https://example.ge/notary',
  factDate: '2025-03-01',
};

/** #4225 (the tester's 65720): a researched fact on a seat's contact, so a search can find it. */
describe('the research-fact fixture', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes it as the base load does: the system saver, private, with source and date', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: SEAT }] } as never)
      .mockResolvedValueOnce({ rows: [{ found: true }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    await expect(writeResearchFact(SEAT, fact)).resolves.toBe(FixtureOutcome.Written);
    const [sql, params] = mockQuery.mock.calls[2];
    expect(String(sql)).toContain(
      "VALUES ($1, '0', $2, $3, false, 'public_research', 'mentioned', false",
    );
    expect(params).toEqual([
      FICTIONAL,
      'occupation',
      'ნოტარიუსი',
      'possible',
      'https://example.ge/notary',
      '2025-03-01',
    ]);
  });

  it('refuses a bad field, status, link or date before reading anything', async () => {
    for (const bad of [
      { fieldType: 'phone' },
      { status: 'sure' },
      { sourceUrl: 'example.ge' },
      { factDate: 'March 2025' },
      { value: '  ' },
    ]) {
      await expect(writeResearchFact(SEAT, { ...fact, ...bad })).resolves.toBe(
        FixtureOutcome.BadInput,
      );
    }
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('never writes on a real number, even one the seat saved', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: SEAT }] } as never);
    await expect(writeResearchFact(SEAT, { ...fact, phone: '+995599123456' })).resolves.toBe(
      FixtureOutcome.NotTheSeatsContact,
    );
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('refuses a real account', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await expect(writeResearchFact(501, fact)).resolves.toBe(FixtureOutcome.NotATestSeat);
  });
});
