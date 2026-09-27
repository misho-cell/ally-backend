/**
 * AN INSIGHT IS ABOUT SOMEBODY, AND THE PHONE IS WHO.
 *
 * `contact_insights` is keyed `(user_id, neo4j_contact_id)` where the id is
 * `normalizePhone(phone)`, and the write is
 *
 *     ON CONFLICT (user_id, neo4j_contact_id)
 *     DO UPDATE SET data = contact_insights.data || EXCLUDED.data
 *
 * — a MERGE. So a save whose phone carries no digits does not fail and does not
 * write a harmless orphan: it lands on the single row keyed `''` and mixes its
 * notes into everything else that ever landed there, under the last name
 * written. The read then hands that mixture back. One person's facts served as
 * another's, inside the owner's own store.
 *
 * ⚠️ AND THE FIRST VERSION OF THIS TEST GUARDED A FUNCTION THAT DOES NOT RUN.
 *
 * It held `createSaveContactInsightTool(...).execute`, which looks like the
 * entry point and is not: `getContactInsightTools` is consumed only by
 * `toAnthropicTool`, which reads `name`, `description` and `parameters` and
 * never touches `execute`. The live call goes through `chat.service.ts`'s
 * dispatcher STRAIGHT to `insights.service`. Eleven tests passed, the guard was
 * real, and the path a person actually reaches was untouched — and it was
 * reported as fixed, here and to the tester.
 *
 * So the rule now lives in `insights.service`, once, where the dispatcher and
 * the (unused) wrapper both arrive, and this file holds it there.
 *
 * `.trim()` was also the wrong question, and that half stands: it asks whether
 * the model typed SOMETHING; the row is keyed by what that something
 * normalizes to. "unknown" is not blank and normalizes to `''` exactly like
 * "   " does. A digitless WORD is the case that proves the guard asks the
 * right question, so it is in every list below.
 */
jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../../db/postgres/client';
import {
  getContactInsight,
  saveContactInsight,
  InsightRefusedError,
  INSIGHT_NEEDS_A_CONTACT,
  INSIGHT_NEEDS_A_NAME,
  INSIGHT_NEEDS_DATA,
} from '../../insights.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

const OWNER = '501';
const A_REAL_PHONE = '+995599112233';
const A_NAME = 'გიორგი';
const SOME_NOTES = { relationship: 'ახლო მეგობარი' };

/**
 * Every one of these reaches `normalizePhone` and comes back `''` — the key of
 * the shared row. The last two are the ones `.trim()` never caught.
 */
const NOT_A_PHONE = ['', '   ', 'unknown', 'the number from the search above'];

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 } as never);
});

describe('a save without a contact never reaches the store', () => {
  it.each(NOT_A_PHONE)('refuses %p', async (phone) => {
    await expect(saveContactInsight(OWNER, phone, A_NAME, SOME_NOTES)).rejects.toThrow(
      INSIGHT_NEEDS_A_CONTACT,
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses a real phone with no name — the row carries the name too', async () => {
    await expect(saveContactInsight(OWNER, A_REAL_PHONE, '  ', SOME_NOTES)).rejects.toThrow(
      INSIGHT_NEEDS_A_NAME,
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });

  /**
   * `data` is `JSONB NOT NULL`, and an explicit `undefined` parameter is NULL
   * on the wire — the column DEFAULT does not apply to a value that was
   * supplied. So an omitted `collected_data` was a not-null violation.
   */
  it.each([undefined, null, 'notes', ['a']])('refuses collected_data of %p', async (data) => {
    await expect(
      saveContactInsight(OWNER, A_REAL_PHONE, A_NAME, data as Record<string, unknown>),
    ).rejects.toThrow(INSIGHT_NEEDS_DATA);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses through a typed error the doors can answer with', async () => {
    await expect(saveContactInsight(OWNER, '', A_NAME, SOME_NOTES)).rejects.toBeInstanceOf(
      InsightRefusedError,
    );
  });

  /**
   * And it does let a real one through. Without this the block above would pass
   * on a store that refused everything, which is the same store broken from the
   * other side.
   */
  it('saves when the phone is a phone', async () => {
    await saveContactInsight(OWNER, A_REAL_PHONE, A_NAME, SOME_NOTES);

    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[1]).toBe(A_REAL_PHONE);
    expect(params[2]).toBe(A_NAME);
  });
});

describe('a read without a contact never reaches the store', () => {
  it.each(NOT_A_PHONE)('answers null for %p', async (phone) => {
    expect(await getContactInsight(OWNER, phone)).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('reads when the phone is a phone', async () => {
    await getContactInsight(OWNER, A_REAL_PHONE);

    expect(mockQuery.mock.calls[0][1]).toEqual([OWNER, A_REAL_PHONE]);
  });
});

/**
 * THE LIVE DOOR, which is the whole reason this file was rewritten. The service
 * can refuse perfectly and the person still loses their run if the dispatcher
 * lets the throw through instead of answering with it.
 */
describe('the chat dispatcher answers the refusal instead of throwing it', () => {
  const dispatcher = readFileSync(join(__dirname, '..', '..', 'chat.service.ts'), 'utf8');

  it('coerces both doors rather than casting', () => {
    expect(dispatcher).toContain("return getContactInsight(userId, String(input['phone'] ?? ''));");
    expect(dispatcher).toContain(
      '        return await saveContactInsight(\n' +
        '          userId,\n' +
        "          String(input['phone'] ?? ''),\n" +
        "          String(input['contact_name'] ?? ''),",
    );
  });

  it('turns the refusal into an answer', () => {
    expect(dispatcher).toContain(
      'if (err instanceof InsightRefusedError) return { saved: false, error: err.message };',
    );
  });
});
