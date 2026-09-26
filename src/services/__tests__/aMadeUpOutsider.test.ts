jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';

import { query } from '../../db/postgres/client';
import { addSeatContact, isFictionalNumber, isReadableTag } from '../seatContacts.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const rows = (data: unknown[]) => ({ rows: data, rowCount: data.length });

/**
 * §60, rows 269 and 262(b). D495, the founder: „a made-up outsider on one test
 * seat (not on Netai, number reaches nobody). NOT A REAL PHONE."
 *
 * Misho authorised it directly on 26 September. Every test here is about the
 * sentence „not a real phone", because that is the only thing standing between
 * a test fixture and a stranger's number in somebody's contacts.
 */
beforeEach(() => jest.clearAllMocks());

describe('the number has to be nobody’s', () => {
  /**
   * ⚠️ A PREFIX TEST WOULD NOT HAVE BEEN ENOUGH. „+1202555" alone admits
   * +12025551234, which is a real number somewhere. The slot must be inside
   * the reserved hundred.
   */
  it('takes only the reserved hundred, not the whole prefix', () => {
    expect(isFictionalNumber('+12025550100')).toBe(true);
    expect(isFictionalNumber('+12025550199')).toBe(true);
    expect(isFictionalNumber('+12025550099')).toBe(false);
    expect(isFictionalNumber('+12025550200')).toBe(false);
    // The shape that would have slipped through a prefix check.
    expect(isFictionalNumber('+12025551234')).toBe(false);
    expect(isFictionalNumber('+995555123456')).toBe(false);
    expect(isFictionalNumber('')).toBe(false);
  });

  it('refuses a real number before it reads anything', async () => {
    const out = await addSeatContact(172101, '+995555123456', 'Someone', 'arci');

    expect(out).toEqual({
      ok: false,
      refusal: 'not_a_fictional_number',
      // The refusal SAYS the range, so a caller is not left guessing which
      // numbers are allowed.
      detail: '+12025550100-0199',
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ EVEN INSIDE THE RANGE, A NUMBER WITH AN ACCOUNT IS SOMEBODY. Netai Test
   * 5 sits on a number a real owner had had since August — that is why the
   * seat route checks registration as well as range, and so does this.
   */
  it('refuses a fictional number somebody is registered on', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ user_id: 172101 }]) as never) // it IS a seat
      .mockResolvedValueOnce(rows([{ id: 9 }]) as never); // and the phone is taken

    const out = await addSeatContact(172101, '+12025550150', 'Someone', 'arci');

    expect(out).toEqual({ ok: false, refusal: 'somebody_is_registered_on_it' });
    // Two reads, and NOTHING written.
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('refuses a target that is not a test seat', async () => {
    mockQuery.mockResolvedValueOnce(rows([]) as never);

    const out = await addSeatContact(501, '+12025550150', 'Someone', 'arci');

    expect(out).toEqual({ ok: false, refusal: 'not_a_test_seat' });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

/**
 * ⚠️ THE TAG HAS TO BE ONE THE MATCHER WILL ACTUALLY READ. `newMemberForGoal`
 * accepts letters, digits and spaces and ignores everything else — so a tag
 * this route wrote and that matcher refused would be a test failing for a
 * reason nobody would ever find.
 */
describe('the tag is one the matcher can read', () => {
  it('accepts what newMemberForGoal accepts', () => {
    expect(isReadableTag('arci')).toBe(true);
    expect(isReadableTag('Arci Construction')).toBe(true);
    expect(isReadableTag('ბანკი')).toBe(true);
    expect(isReadableTag('')).toBe(false);
    expect(isReadableTag('   ')).toBe(false);
    expect(isReadableTag('arci%')).toBe(false);
    expect(isReadableTag('a'.repeat(41))).toBe(false);
  });

  it('is the same rule, in both files', () => {
    const matcher = readFileSync(join(__dirname, '..', 'newMemberForGoal.service.ts'), 'utf8');

    expect(matcher).toContain("TRIM(ut.tag) ~ '^[[:alnum:] ]+$'");
  });

  it('refuses a tag the matcher would ignore, before writing', async () => {
    const out = await addSeatContact(172101, '+12025550150', 'Someone', 'arci%');

    expect(out).toEqual({ ok: false, refusal: 'bad_tag' });
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('what it writes when it accepts', () => {
  it('writes the name and the tag, and nothing else', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ user_id: 172101 }]) as never)
      .mockResolvedValueOnce(rows([]) as never)
      .mockResolvedValue(rows([]) as never);

    const out = await addSeatContact(172101, '+12025550150', 'Tinatin R', 'arci');

    expect(out).toEqual({
      ok: true,
      contact: { seat: 172101, phone: '+12025550150', name: 'Tinatin R', tag: 'arci' },
    });
    const written = mockQuery.mock.calls
      .map(([sql]) => String(sql))
      .filter((s) => s.includes('INSERT'));
    expect(written).toHaveLength(2);
    expect(written[0]).toContain('"UserAlias"');
    expect(written[1]).toContain('"UserTags"');
    // It registers nobody and opens no door.
    expect(written.join(' ')).not.toContain('"UserPhone"');
    expect(written.join(' ')).not.toMatch(/INSERT INTO "User"\s/);
  });

  /** The tag row must be the shape the matcher joins on: owner + phone + tag. */
  it('writes the tag against the SEAT, which is who the matcher asks about', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ user_id: 172101 }]) as never)
      .mockResolvedValueOnce(rows([]) as never)
      .mockResolvedValue(rows([]) as never);

    await addSeatContact(172101, '+12025550150', 'Tinatin R', 'arci');

    const tagCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes('"UserTags"'));
    expect((tagCall as [string, unknown[]])[1].slice(0, 3)).toEqual([
      172101,
      '+12025550150',
      'arci',
    ]);
  });
});
