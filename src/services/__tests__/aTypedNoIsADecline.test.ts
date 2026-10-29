import { readFileSync } from 'fs';
import { join } from 'path';
import { isTypedDecline } from '../typedDecline';

/**
 * 3433 (QA-026, fresh pairs, 8 Oct): „აზრზე არ ვარ" and „არა, ვერ მოვახერხებ,
 * სხვას ჰკითხოს." were stored as answers; only the decline button declined.
 */
describe('a typed no', () => {
  it.each([
    'აზრზე არ ვარ',
    'არა, ვერ მოვახერხებ, სხვას ჰკითხოს.',
    'არ ვიცნობ ასეთს',
    'წარმოდგენა არ მაქვს',
    'ვერ დაგეხმარები, ბოდიში',
    'No idea, sorry',
    "I don't know anyone like that",
    'Не знаю',
    'No sé',
  ])('„%s" is a decline', (line) => {
    expect(isTypedDecline(line)).toBe(true);
  });

  it.each([
    'კი, ვიცნობ ერთს',
    'არ ვიცნობ, მაგრამ ჩემი ძმა იცნობს',
    'არ ვიცი ზუსტად, ნომერია 555 12 34 56',
    'ნინო გამოგონილი, ძალიან კარგი სტომატოლოგია',
    `არ ვიცი ${'და '.repeat(60)}`,
    '',
  ])('„%s" is not', (line) => {
    expect(isTypedDecline(line)).toBe(false);
  });

  it('the answer write reads the helper’s own line typed since the question', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    const fn = asks.slice(asks.indexOf('async function answerIsADecline('));
    expect(fn.slice(0, 1200)).toContain("c.role = 'user' AND c.kind = 'message'");
    expect(fn.slice(0, 1200)).toContain(
      'c.created_at > (SELECT MAX(a.created_at) FROM task_asks a',
    );
    expect(fn.slice(0, 1200)).toContain('isTypedDecline(said)');
  });
});

/**
 * #8154 FAILED on Giorgi's account (29 Oct 19:11 Tbilisi, G-208): a no to the
 * question with an offer of something else is an answer, not a decline.
 */
describe('a no with something offered (#8154, G-208)', () => {
  it('is an answer: an offer word, or a second sentence that is not a no', () => {
    expect(isTypedDecline('ქართველი ფეხბურთელები არ ვიცი. შემიძლია კალათბურთელი შემოგთავაზო')).toBe(
      false,
    );
    expect(isTypedDecline('არ ვიცი. ჩემი ძმა იცნობს ბევრს')).toBe(false);
    expect(isTypedDecline("I don't know any. I can offer a basketball player")).toBe(false);
  });

  it('is still a decline when what follows is only a wish or a thank-you', () => {
    expect(isTypedDecline('არ ვიცნობ. წარმატებები!')).toBe(true);
    expect(isTypedDecline('არ ვიცნობ, მადლობა')).toBe(true);
    expect(isTypedDecline('არა, ვერ მოვახერხებ, სხვას ჰკითხოს.')).toBe(true);
  });
});
