/**
 * „NEVER SUGGEST HIM FOR WORK AGAIN" — SAVED, AND INERT FOREVER.
 *
 * `contact_exclusions` rows are keyed `(user_id, contact_phone, excluded_for)`
 * on `phoneDigits(contactPhone)`, and the read side is
 *
 *     const digits = [...new Set(phones.map(phoneDigits))].filter(Boolean);
 *
 * — `filter(Boolean)` drops the empty key. So a save whose phone carries no
 * digits is not a save that fails: it writes a row NOTHING WILL EVER ASK FOR
 * and answers `{ saved: true }`. The person is told their decision was
 * recorded, the assistant goes on suggesting that contact, and there is no
 * error anywhere to find later.
 *
 * TWO DOORS, ONE FLOOR. The MCP door checks the phone before it gets here
 * (`decodeContactRef` -> UNKNOWN_CONTACT_REF). The chat door passes
 * `String(input['phone'] ?? '')` straight through — nothing between the model
 * and the write. That is why the check is in the service both doors call and
 * not at the door that happened to be missing it.
 *
 * ⚠️ FOUND BY `sabotage.py` ON 27 SEPTEMBER, in line mode:
 *
 *     if (!scope || !why) return { saved: false, error: 'Pass excluded_for and reason.' };
 *
 * survived with the suite green. Reading it to write the test found the
 * larger half: the guard checked the two FIELDS of the row and not the one
 * the row is KEYED BY. Same shape as the contact-insight write fixed earlier
 * the same day, at a different table.
 */
jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../../db/postgres/client';
import { saveContactExclusion, fetchExclusionsForPhones } from '../contactExclusions';

const mockQuery = query as jest.MockedFunction<typeof query>;

const OWNER = '501';
const A_REAL_PHONE = '+995599112233';
const SCOPE = 'სამუშაო რეკომენდაცია';
const WHY = 'ბოლო პროექტი არ დაასრულა';

/** Each of these is `''` after `phoneDigits` — the key no read ever asks for. */
const NOT_A_PHONE = ['', '   ', 'unknown', 'the one from the list above'];

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
});

describe('an exclusion without a contact', () => {
  it.each(NOT_A_PHONE)('is refused, not silently stored — %p', async (phone) => {
    const result = await saveContactExclusion(OWNER, phone, SCOPE, WHY);

    expect(result).toEqual({ saved: false, error: 'Pass the phone id from a search result.' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  /**
   * The read side is the reason the above matters, so it is pinned here rather
   * than assumed: the empty key is dropped before the query, so a row stored
   * under it could never come back.
   */
  it('could never have been read back — the empty key is filtered out', async () => {
    const found = await fetchExclusionsForPhones(OWNER, ['', '   ']);

    expect(found.size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('an exclusion without a scope or a reason', () => {
  it('is refused when the scope is missing', async () => {
    const result = await saveContactExclusion(OWNER, A_REAL_PHONE, '  ', WHY);

    expect(result).toEqual({ saved: false, error: 'Pass excluded_for and reason.' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is refused when the reason is missing', async () => {
    const result = await saveContactExclusion(OWNER, A_REAL_PHONE, SCOPE, '');

    expect(result).toEqual({ saved: false, error: 'Pass excluded_for and reason.' });
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('a complete exclusion', () => {
  it('is written under the digits the read side will look for', async () => {
    const result = await saveContactExclusion(OWNER, A_REAL_PHONE, SCOPE, WHY, 'თუ გუნდი შეიცვალა');

    expect(result).toEqual({ saved: true });
    expect(mockQuery).toHaveBeenCalledTimes(1);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO contact_exclusions');
    expect(params).toEqual([OWNER, '995599112233', SCOPE, WHY, 'თუ გუნდი შეიცვალა']);
  });
});
