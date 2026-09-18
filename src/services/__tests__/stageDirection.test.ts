jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  __esModule: true,
  query: jest.fn(),
  default: {},
}));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { STAGE_DIRECTION_ONLY_RE } from '../chat.service';

/**
 * Ticket 20 row 106's family — the note to itself that reached a person.
 *
 * Reported by the seat inside their row 125 run, and it is the third fault of
 * that run rather than a row of its own. Lika, thread 17723, 13:46:12: the
 * STORED message content is literally „*[ველოდები არჩევანს]*" — waiting for
 * choice, in brackets, with four buttons under it. Her actual question,
 * „რომელი სალომეს გულისხმობ?", had gone out five seconds earlier as a STEP,
 * which is narration and not the message.
 *
 * A sweep of thirty days found one more and no others: thread 17227, 07:17:46,
 * „[ეს შესაძლებლობა UI-ში აისახება]" — our own UI, announced to the person
 * using it, also above two buttons.
 *
 * The regex has to be tight. A bracket inside a real sentence is the model
 * writing normally, and this rule may not touch it.
 */
describe('a reply that is only a stage direction', () => {
  it('catches the two that reached real people', () => {
    expect(STAGE_DIRECTION_ONLY_RE.test('*[ველოდები არჩევანს]*')).toBe(true);
    expect(STAGE_DIRECTION_ONLY_RE.test('[ეს შესაძლებლობა UI-ში აისახება]')).toBe(true);
  });

  it('catches them with the whitespace a model leaves around them', () => {
    expect(STAGE_DIRECTION_ONLY_RE.test('\n  [waiting for the user to choose]  \n')).toBe(true);
    expect(STAGE_DIRECTION_ONLY_RE.test('_[thinking]_')).toBe(true);
  });

  it('leaves a real sentence alone, whatever brackets are inside it', () => {
    expect(STAGE_DIRECTION_ONLY_RE.test('ლიკა [ოსეფაშვილი] დაგეხმარება.')).toBe(false);
    expect(STAGE_DIRECTION_ONLY_RE.test('Two options: [a] and [b] — which one?')).toBe(false);
    expect(
      STAGE_DIRECTION_ONLY_RE.test('რომელი სალომეს გულისხმობ? რამდენიმე მაქვს შენახული:'),
    ).toBe(false);
  });

  it('is not fooled by an unclosed or empty bracket', () => {
    expect(STAGE_DIRECTION_ONLY_RE.test('[')).toBe(false);
    expect(STAGE_DIRECTION_ONLY_RE.test('[]')).toBe(false);
    expect(STAGE_DIRECTION_ONLY_RE.test('')).toBe(false);
  });

  it('does not swallow a long reply that happens to start and end with a bracket', () => {
    // 200 characters is the ceiling on purpose: a stage direction is short,
    // and a reply this size is somebody's answer whatever punctuation it wears.
    expect(STAGE_DIRECTION_ONLY_RE.test(`[${'ა'.repeat(250)}]`)).toBe(false);
  });

  it('has no global flag, so repeated tests give the same answer', () => {
    // A /g regex carries lastIndex between calls and would return false every
    // other time — on a rule that decides whether a person is shown a note to
    // ourselves, that is a coin toss.
    expect(STAGE_DIRECTION_ONLY_RE.global).toBe(false);
    expect(STAGE_DIRECTION_ONLY_RE.test('*[ველოდები არჩევანს]*')).toBe(true);
    expect(STAGE_DIRECTION_ONLY_RE.test('*[ველოდები არჩევანს]*')).toBe(true);
  });
});
