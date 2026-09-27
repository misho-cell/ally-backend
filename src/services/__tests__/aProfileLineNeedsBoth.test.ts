jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { setUserProfileField, PROFILE_LINE_NEEDS_BOTH } from '../userProfile.service';
import { savePrivateContext } from '../userPrivateContext.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * THE TWO PLACES A PERSON'S OWN PROFILE IS WRITTEN, AND NEITHER CHECKED.
 *
 * `update_user_profile` and `save_private_context` both handed their fields
 * over with `input['key'] as string` — a CAST, which converts nothing. `key`
 * and `value` are `TEXT NOT NULL` in both tables, and `savePrivateContext`
 * reaches the value with `.replace` BEFORE the query runs, so an omitted field
 * was a TypeError at one door and a not-null violation at the other. Nothing
 * catches a tool that throws.
 *
 * Coercing the doors alone would have traded that for something quieter and
 * worse: `''` is a perfectly storable key, `ON CONFLICT (user_id, key)`
 * collapses every empty-key save onto the SAME row, and no read for a real key
 * ever finds it. So the doors coerce AND the services refuse — and the answer
 * says which it was, instead of the `Promise<void>` that could not say
 * anything.
 *
 * The private one is the one that matters most: it is where „strictly
 * confidential" lines about the owner go, and the value is stripped of phone
 * numbers on the way in. A save that silently did nothing there is a person
 * believing something was recorded about them that was not.
 */
const MISSING = ['', '   '];

const OWNER = '501';
const A_KEY = 'preferred_length';
const A_VALUE = 'მოკლე პასუხები';

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
});

describe('the public profile line', () => {
  it.each(MISSING)('is refused when the key is missing — %p', async (key) => {
    expect(await setUserProfileField(OWNER, key, A_VALUE)).toEqual({
      saved: false,
      error: PROFILE_LINE_NEEDS_BOTH,
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it.each(MISSING)('is refused when the value is missing — %p', async (value) => {
    expect(await setUserProfileField(OWNER, A_KEY, value)).toEqual({
      saved: false,
      error: PROFILE_LINE_NEEDS_BOTH,
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is written when both are there', async () => {
    expect(await setUserProfileField(OWNER, A_KEY, A_VALUE)).toEqual({ saved: true });
    expect(mockQuery.mock.calls[0][1]).toEqual([OWNER, A_KEY, A_VALUE]);
  });
});

describe('the private context line', () => {
  it.each(MISSING)('is refused when the key is missing — %p', async (key) => {
    expect(await savePrivateContext(OWNER, key, A_VALUE, 'set')).toEqual({
      saved: false,
      error: PROFILE_LINE_NEEDS_BOTH,
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it.each(MISSING)('is refused when the value is missing — %p', async (value) => {
    expect(await savePrivateContext(OWNER, A_KEY, value, 'set')).toEqual({
      saved: false,
      error: PROFILE_LINE_NEEDS_BOTH,
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is written when both are there, with the phone stripping intact', async () => {
    expect(await savePrivateContext(OWNER, A_KEY, 'დაურეკე 599 11 22 33', 'set')).toEqual({
      saved: true,
    });

    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe(OWNER);
    expect(params[1]).toBe(A_KEY);
    expect(String(params[2])).not.toContain('599');
  });
});

/**
 * AND THE DOORS, because a service that refuses changes nothing if the
 * argument never arrives as a string at all.
 */
describe('the chat doors coerce rather than casting', () => {
  const dispatcher = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it.each([
    "      return setUserProfileField(\n        userId,\n        String(input['key'] ?? ''),\n        String(input['value'] ?? ''),",
    "      return savePrivateContext(\n        userId,\n        String(input['key'] ?? ''),\n        String(input['value'] ?? ''),",
    "      return searchContactsByCountry(userId, String(input['country'] ?? ''));",
  ])('passes a string', (wire) => {
    expect(dispatcher).toContain(wire);
  });
});
