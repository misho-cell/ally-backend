/**
 * „BLOCK HIM." — `{ ok: true }`, AND HE WAS NOT BLOCKED.
 *
 * Three writes stand behind three of the most consequential things a person
 * can ask this product for: block somebody, unblock somebody, mark somebody as
 * having died. All three are keyed on a phone. `normalizePhone` answers `''`
 * for anything with no digits in it — an absent argument, a name, „the one
 * above" — and every read compares real phones against the stored key, so a
 * row under `''` matches nobody, ever.
 *
 * All three used to return `Promise<void>`, and the chat dispatcher turned
 * that into a flat `{ ok: true }`:
 *
 *     case 'block_contact':
 *       await blockContact(userId, input['phone'] as string);
 *       return { ok: true };
 *
 * — so the answer could not have said anything else. The person is told the
 * contact was blocked. The contact is not blocked. Nothing anywhere records
 * that this happened, and the next thing the person notices is a suggestion
 * for somebody they asked never to see again.
 *
 * THIS IS THE THIRD TABLE IN ONE DAY WITH THE SAME FAULT — after
 * `contact_insights` and `contact_exclusions`, both found by `sabotage.py` and
 * both fixed this morning. The sweep cannot find this one: it falsifies guards
 * that EXIST, and here the guard was missing. What found it was taking the
 * shape the sweep had shown twice — A WRITE KEYED ON A PHONE THAT NO READ WILL
 * EVER ASK FOR — and going looking for every other write of that shape.
 *
 * `mark_contact_deceased` also stored the phone RAW while `getExcludedPhoneSet`
 * normalizes both sides on read. That worked, and only because the read side
 * was careful; it is canonical on the way in now too.
 */
jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../askBoundary.service', () => ({
  __esModule: true,
  boundaryExclusionsFor: jest.fn().mockResolvedValue([]),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { blockContact, unblockContact, NO_CONTACT_IN_THE_CALL } from '../block.service';
import { markContactDeceased } from '../deceased.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

const OWNER = '501';
/** Every shape a real number can arrive in — all one canonical value. */
const A_REAL_PHONE = '599 11 22 33';
const CANONICAL = '+995599112233';

/** Each of these is `''` after `normalizePhone` — the key no read ever matches. */
const NOT_A_PHONE = ['', '   ', 'unknown', 'the one above', 'გიორგი'];

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
});

describe('a block without a contact', () => {
  it.each(NOT_A_PHONE)('is refused and says so — %p', async (phone) => {
    expect(await blockContact(OWNER, phone)).toEqual({
      blocked: false,
      error: NO_CONTACT_IN_THE_CALL,
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('writes the canonical number when the phone is a phone', async () => {
    expect(await blockContact(OWNER, A_REAL_PHONE)).toEqual({ blocked: true });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO "UserBlock"');
    expect(params).toEqual([OWNER, CANONICAL]);
  });
});

describe('an unblock without a contact', () => {
  it.each(NOT_A_PHONE)('is refused and says so — %p', async (phone) => {
    expect(await unblockContact(OWNER, phone)).toEqual({
      unblocked: false,
      error: NO_CONTACT_IN_THE_CALL,
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  /**
   * An unblock that quietly did nothing is the same lie pointing the other
   * way: the person believes they have let somebody back in.
   */
  it('deletes the canonical row and the legacy raw one', async () => {
    expect(await unblockContact(OWNER, A_REAL_PHONE)).toEqual({ unblocked: true });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('DELETE FROM "UserBlock"');
    expect(params).toEqual([OWNER, CANONICAL, A_REAL_PHONE]);
  });
});

describe('marking a contact as having died', () => {
  it.each(NOT_A_PHONE)('is refused and says so — %p', async (phone) => {
    expect(await markContactDeceased(OWNER, phone)).toEqual({
      marked: false,
      error: NO_CONTACT_IN_THE_CALL,
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('stores the canonical number, not what was typed', async () => {
    expect(await markContactDeceased(OWNER, A_REAL_PHONE)).toEqual({ marked: true });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO "ContactDeceased"');
    expect(params).toEqual([OWNER, CANONICAL]);
  });
});

/**
 * AND THE WIRE, which is where the whole thing actually went wrong. The three
 * services can refuse perfectly and it changes nothing if the dispatcher
 * discards the answer and returns its own `{ ok: true }` — that IS what it did.
 * The dispatcher is a `switch` inside a long closure with no seam to call, so
 * this is asserted on the source, whole lines rather than fragments.
 */
describe('the chat dispatcher hands back what the service answered', () => {
  const dispatcher = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it.each([
    "case 'mark_contact_deceased':\n      return markContactDeceased(userId, String(input['phone'] ?? ''));",
    "case 'block_contact':\n      return blockContact(userId, String(input['phone'] ?? ''));",
    "case 'unblock_contact':\n      return unblockContact(userId, String(input['phone'] ?? ''));",
  ])('returns the result itself', (wire) => {
    expect(dispatcher).toContain(wire);
  });
});
