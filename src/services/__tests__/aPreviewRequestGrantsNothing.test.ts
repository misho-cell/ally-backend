import { readFileSync } from 'fs';
import { join } from 'path';
import { ownerWordsGrantPermission } from '../chat.service';
import { asksForAPreview, looksLikeContactInstruction } from '../goalIntent';
import { contactInstructionIn } from '../instructionUnsent';

/**
 * 2906, second fix (ops 01:05Z, ask 17656): the owner wrote „…ჯერ მაჩვენე,
 * რას მისწერ მარიამს." — show me first what you will write. The D316 path read
 * the line as an instruction, the permission was granted and the ask went out.
 * A line that asks to see the message first is not an instruction to send,
 * whichever reader looks at it.
 */
const TESTER_LINE =
  'მინდა მარიამ სატესტოს ვკითხო, ხომ არ იცის კარგი სტომატოლოგი. ჯერ მაჩვენე, რას მისწერ მარიამს.';

describe('a request to see the message first', () => {
  it('is read as a preview request', () => {
    expect(asksForAPreview(TESTER_LINE)).toBe(true);
    expect(asksForAPreview('Show me first what you will write to Maria')).toBe(true);
  });

  it('is not a contact instruction', () => {
    expect(looksLikeContactInstruction(TESTER_LINE)).toBe(false);
    expect(contactInstructionIn(TESTER_LINE)).toBeNull();
  });

  it('grants no permission', () => {
    expect(ownerWordsGrantPermission(TESTER_LINE, [])).toBe(false);
    expect(ownerWordsGrantPermission(null, [TESTER_LINE])).toBe(false);
  });

  it('leaves a plain instruction an instruction', () => {
    const plain = 'ჰკითხე მარიამ სატესტოს, ხომ არ იცის კარგი სტომატოლოგი';
    expect(asksForAPreview(plain)).toBe(false);
    expect(looksLikeContactInstruction(plain)).toBe(true);
    expect(ownerWordsGrantPermission(plain, [])).toBe(true);
  });

  it('is checked on the whole line before the instruction sentence is cut out', () => {
    const body = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const at = body.indexOf('async function ownerJustInstructedThePlansOnePerson(');
    const fn = body.slice(at, body.indexOf('\n}\n', at));
    expect(fn.indexOf('asksForAPreview(said)')).toBeGreaterThan(-1);
    expect(fn.indexOf('asksForAPreview(said)')).toBeLessThan(
      fn.indexOf('looksLikeContactInstruction(instructionSentence('),
    );
  });
});
