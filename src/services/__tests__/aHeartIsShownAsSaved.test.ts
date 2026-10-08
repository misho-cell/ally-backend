import { readFileSync } from 'fs';
import { join } from 'path';
import { labelsTheReplyLeftOut, namelessLabelLines, namelessLabelsIn } from '../namelessLabels';

/**
 * 3137 (ME-011, seats 179900 and 179959): a contact saved only as „💙", tagged
 * სტომატოლოგი. The search found it; both replies said it had no name and
 * never showed the 💙.
 */
const RESULT = {
  found: true,
  results: [
    { phone: '+441174960335', name: null, saved_as: '💙', tags: ['სტომატოლოგი'] },
    { phone: '+441174960336', name: 'ნინო ტესტური', saved_as: 'ნინო ტესტური', tags: [] },
    { phone: '+441174960337', name: null, saved_as: 'Dr ✦', tags: [] },
  ],
};
const REPLY = 'ერთი სტომატოლოგი გყავს შენახული, მაგრამ ჩანაწერში სახელი არ წერია, მხოლოდ სიმბოლოა.';

describe('a label with no letter in it', () => {
  it('is read from the search result, and a label with letters is not', () => {
    expect(namelessLabelsIn(RESULT)).toEqual([{ label: '💙', tags: ['სტომატოლოგი'] }]);
    expect(namelessLabelsIn({ found: false })).toEqual([]);
  });

  it('is left out of the reply of ME-011', () => {
    expect(labelsTheReplyLeftOut(namelessLabelsIn(RESULT), REPLY)).toEqual([
      { label: '💙', tags: ['სტომატოლოგი'] },
    ]);
  });

  it('is not added when the reply shows it, nor twice', () => {
    const twice = [...namelessLabelsIn(RESULT), ...namelessLabelsIn(RESULT)];
    expect(labelsTheReplyLeftOut(twice, 'შენახული გყავს როგორც 💙.')).toEqual([]);
    expect(labelsTheReplyLeftOut(twice, REPLY)).toHaveLength(1);
  });

  it('is said as saved, with what it is saved for', () => {
    expect(namelessLabelLines([{ label: '💙', tags: ['სტომატოლოგი'] }], 'ka')).toBe(
      'შენახული გყავს როგორც „💙" (სტომატოლოგი).',
    );
    expect(namelessLabelLines([{ label: '💙', tags: [] }], 'en')).toBe(
      'You have them saved as „💙".',
    );
  });

  it('every search notes them and the reply adds the ones it left out', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'if (SEARCH_TOOLS.has(block.name)) noteNamelessLabels(runId, namelessLabelsIn(labelled));',
    );
    expect(chat).toContain(
      'const unsaidLabels = labelsTheReplyLeftOut(takeNamelessLabels(runId), finalText);',
    );
    expect(chat).toContain('runNamelessLabels.delete(runId);');
  });
});
