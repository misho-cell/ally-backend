const clientQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: (fn: (c: { query: jest.Mock }) => Promise<unknown>) =>
    fn({ query: clientQuery }),
}));

import { query } from '../../db/postgres/client';
import { allFictionalNumbers } from '../fictionalNumbers';
import { addSeatContactsBulk, MAX_BULK_CONTACTS } from '../seatContactsBulk.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const SEAT = 172990;

function theBase(opts: { seat?: boolean; registered?: boolean } = {}): void {
  mockQuery.mockImplementation((sql: string) => {
    const text = String(sql);
    // The registration read names test_seats too (#1918), so it is matched first.
    if (text.includes('FROM "UserPhone"'))
      return Promise.resolve({ rows: opts.registered ? [{ id: 1 }] : [], rowCount: 0 } as never);
    if (text.includes('FROM test_seats'))
      return Promise.resolve({
        rows: opts.seat === false ? [] : [{ user_id: SEAT }],
        rowCount: 1,
      } as never);
    return Promise.resolve({ rows: [], rowCount: 0 } as never);
  });
}

const contacts = (n: number): { phone: string; name: string; tag: string }[] =>
  allFictionalNumbers()
    .slice(0, n)
    .map((phone, i) => ({ phone, name: `Kontakti ${i}`, tag: i < 9 ? 'advokati' : 'meqanike' }));

beforeEach(() => jest.clearAllMocks());

/** Row 321 on a seat: Giorgi's 1,177-contact phonebook, reproduced in one call. */
describe("a seat the size of Giorgi's phonebook", () => {
  it('writes every contact and tag in one transaction', async () => {
    theBase();
    const result = await addSeatContactsBulk(SEAT, contacts(MAX_BULK_CONTACTS));
    expect(result).toEqual({ ok: true, seat: SEAT, added: MAX_BULK_CONTACTS });
    expect(clientQuery).toHaveBeenCalledTimes(2);
    expect(String(clientQuery.mock.calls[0][0])).toContain('INSERT INTO "UserAlias"');
    expect(clientQuery.mock.calls[0][1][1]).toHaveLength(MAX_BULK_CONTACTS);
    expect(String(clientQuery.mock.calls[1][0])).toContain('INSERT INTO "UserTags"');
  });

  it('refuses the whole batch on one real-looking number, and says which', async () => {
    theBase();
    const batch = contacts(3);
    batch[2] = { ...batch[2], phone: '+995599123456' };
    const result = await addSeatContactsBulk(SEAT, batch);
    expect(result).toEqual(
      expect.objectContaining({ ok: false, refusal: 'not_a_fictional_number', index: 2 }),
    );
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('refuses a batch in which any number belongs to an account', async () => {
    theBase({ registered: true });
    await expect(addSeatContactsBulk(SEAT, contacts(5))).resolves.toEqual({
      ok: false,
      refusal: 'somebody_is_registered_on_it',
    });
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('refuses anything that is not a test seat, an empty or oversized batch, and repeats', async () => {
    theBase({ seat: false });
    await expect(addSeatContactsBulk(SEAT, contacts(2))).resolves.toEqual({
      ok: false,
      refusal: 'not_a_test_seat',
    });
    theBase();
    await expect(addSeatContactsBulk(SEAT, [])).resolves.toEqual({ ok: false, refusal: 'empty' });
    const tooMany = [...contacts(MAX_BULK_CONTACTS), contacts(1)[0]];
    await expect(addSeatContactsBulk(SEAT, tooMany)).resolves.toEqual({
      ok: false,
      refusal: 'too_many',
    });
    const twice = [contacts(1)[0], contacts(1)[0]];
    await expect(addSeatContactsBulk(SEAT, twice)).resolves.toEqual(
      expect.objectContaining({ refusal: 'duplicate_phone', index: 1 }),
    );
    expect(clientQuery).not.toHaveBeenCalled();
  });
});
