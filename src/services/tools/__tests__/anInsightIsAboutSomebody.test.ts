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
 * ⚠️ FOUND BY `sabotage.py` ON 27 SEPTEMBER, in block mode, in BOTH tools:
 *
 *     if (!phone.trim()) { ... }                        ->  if (false) {
 *     if (!phone.trim() || !contact_name.trim()) { ... } ->  if (false) {
 *
 * and the whole suite stayed green. Nothing downstream looks: `insights.service`
 * normalizes and queries, `normalizePhone` answers `''` for a string with no
 * digits, and the SQL is happy to key a row on it.
 *
 * READING THE TWO GUARDS TO WRITE THIS FOUND THE SECOND HALF. `.trim()` is the
 * wrong question. It asks whether the model typed SOMETHING; the row is keyed
 * by what that something normalizes to. "unknown" and "the number from before"
 * are not blank and normalize to `''` exactly like "   " does — they reached
 * the shared row through a guard that was standing right there. Both tools now
 * ask `normalizePhone(phone)`, which is the value the query actually uses, and
 * these tests hold that distinction rather than the old one: a digitless WORD
 * is the case that proves the guard is asking the right question.
 */
jest.mock('../../insights.service', () => ({
  __esModule: true,
  getContactInsight: jest.fn().mockResolvedValue(null),
  saveContactInsight: jest.fn().mockResolvedValue({ id: 1 }),
}));

import { getContactInsight, saveContactInsight } from '../../insights.service';
import { createGetContactInsightTool } from '../get_contact_insight';
import { createSaveContactInsightTool } from '../save_contact_insight';

const mockGet = getContactInsight as jest.MockedFunction<typeof getContactInsight>;
const mockSave = saveContactInsight as jest.MockedFunction<typeof saveContactInsight>;

const OWNER = '501';
const A_REAL_PHONE = '+995599112233';
const A_NAME = 'გიორგი';
const SOME_NOTES = { relationship: 'ახლო მეგობარი' };

/**
 * Every one of these reaches `normalizePhone` and comes back `''` — the key of
 * the shared row. The last two are the ones `.trim()` never caught.
 */
const NOT_A_PHONE = ['', '   ', 'unknown', 'the number from the search above'];

const get = createGetContactInsightTool(OWNER);
const save = createSaveContactInsightTool(OWNER);

beforeEach(() => jest.clearAllMocks());

describe('a save without a phone never reaches the store', () => {
  it.each(NOT_A_PHONE)('refuses %p', async (phone) => {
    await expect(
      save.execute({ phone, contact_name: A_NAME, collected_data: SOME_NOTES }),
    ).rejects.toThrow('phone and contact_name are required');

    expect(mockSave).not.toHaveBeenCalled();
  });

  it('refuses a real phone with no name — the row carries the name too', async () => {
    await expect(
      save.execute({ phone: A_REAL_PHONE, contact_name: '  ', collected_data: SOME_NOTES }),
    ).rejects.toThrow('phone and contact_name are required');

    expect(mockSave).not.toHaveBeenCalled();
  });

  /**
   * And it does let a real one through. Without this the three above would pass
   * on a tool that refused everything, which is the same store broken from the
   * other side.
   */
  it('saves when the phone is a phone', async () => {
    await save.execute({
      phone: A_REAL_PHONE,
      contact_name: A_NAME,
      collected_data: SOME_NOTES,
    });

    expect(mockSave).toHaveBeenCalledWith(OWNER, A_REAL_PHONE, A_NAME, SOME_NOTES);
  });
});

describe('a read without a phone never reaches the store', () => {
  it.each(NOT_A_PHONE)('refuses %p', async (phone) => {
    await expect(get.execute({ phone })).rejects.toThrow('phone is required');

    expect(mockGet).not.toHaveBeenCalled();
  });

  it('reads when the phone is a phone', async () => {
    await get.execute({ phone: A_REAL_PHONE });

    expect(mockGet).toHaveBeenCalledWith(OWNER, A_REAL_PHONE);
  });
});
