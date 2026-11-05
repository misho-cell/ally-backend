jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { ownerAnswered } from '../chat.service';

/**
 * #8779 group b, rule 33 (the founder, 4 Nov 19:07): no fixed word lists. A goal
 * closed only when the owner's words matched a list of solved words — Row 310's
 * „მოგვარებულია", row 313's malformed label and 64517's „No need, it is solved"
 * were each a word the list had to learn. Whether the owner's words say solved is
 * the model's reading now; the server checks only that the owner has answered.
 */
describe('#8779 (rule 33): a goal closes on the owner’s yes as the model reads it', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const handler = chat.slice(chat.indexOf("case 'finish_task': {"));
  const body = handler.slice(0, handler.indexOf("case 'get_my_tasks':"));

  it('reads only whether the owner has answered — any words', () => {
    expect(ownerAnswered('No need, it is solved. Levan helped me find him.')).toBe(true);
    expect(ownerAnswered('კარგი, დავხუროთ')).toBe(true);
    expect(ownerAnswered('   ')).toBe(false);
    expect(ownerAnswered(null)).toBe(false);
  });

  it('closes only on the model’s confirmed yes — no word match closes it alone', () => {
    expect(body).toContain("if (!isConfirmed(input['confirmed'])) {");
    expect(body).not.toContain('ownerSaid !== true');
    expect(chat).not.toContain('export function ownerSaysSolved(');
  });

  it('still refuses when the owner has not answered at all', () => {
    expect(body).toContain('if (ownerSaid === false) {');
  });

  /** Tester 944 (D532): after the owner's „solved" the model asked to confirm once more. */
  it('tells the model not to ask again when the owner already said it', () => {
    expect(body).toContain('call this again now with confirmed: true — do not ask them again');
    expect(chat).toContain(
      "do not ask who ' +\n    'solved it and do not ask them to confirm again",
    );
  });
});
