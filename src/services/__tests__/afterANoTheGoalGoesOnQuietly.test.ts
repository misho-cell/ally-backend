import { readFileSync } from 'fs';
import { join } from 'path';
import {
  answerOnlySaysNo,
  broughtAResult,
  noteQuietAfterDecline,
  takeQuietAfterDecline,
} from '../quietSystemRun';

/**
 * 1489, Misho's choice (გ), 8 Oct: after a helper's „no" the goal carries on
 * quietly and writes to the owner only with a result (RW-015: „nobody else in
 * your contacts either…" 30–40 s after the „no" card).
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');

describe('what counts as only a „no"', () => {
  it.each([
    ['არა, სამწუხაროდ არავის ვიცნობ.', false],
    ['No, I don’t know anyone.', false],
    ['Нет, никого не знаю', false],
    ['ამაში ვერ დაგეხმარები', true],
  ])('%s (button: %s)', (answer, button) => {
    expect(answerOnlySaysNo(answer, button)).toBe(true);
  });

  it.each([
    'არა, მაგრამ ნინო იცნობს ერთს',
    'No, but my cousin knows one',
    'კი, ნინო სტომატოლოგი',
    'არ ვიცი',
  ])('a lead or an answer is not: %s', (answer) => {
    expect(answerOnlySaysNo(answer, false)).toBe(false);
  });
});

describe('the run after it', () => {
  const search = (found: boolean): Array<{ role: string; content: unknown }> => [
    { role: 'assistant', content: [{ type: 'tool_use', name: 'search_by_tag' }] },
    { role: 'user', content: [{ type: 'tool_result', content: JSON.stringify({ found }) }] },
  ];

  it('brought nothing: searches found nobody, nothing was sent', () => {
    expect(broughtAResult(search(false))).toBe(false);
    expect(broughtAResult([{ role: 'assistant', content: 'text only' }])).toBe(false);
  });

  it('brought something: a search found somebody, or a question went', () => {
    expect(broughtAResult(search(true))).toBe(true);
    expect(
      broughtAResult([
        {
          role: 'user',
          content: [{ type: 'tool_result', content: [{ type: 'text', text: '{"found":true}' }] }],
        },
      ]),
    ).toBe(true);
    expect(
      broughtAResult([{ role: 'assistant', content: [{ type: 'tool_use', name: 'ask_contact' }] }]),
    ).toBe(true);
  });

  it('the mark is read once, per conversation', () => {
    noteQuietAfterDecline(44001);
    expect(takeQuietAfterDecline(44002)).toBe(false);
    expect(takeQuietAfterDecline(44001)).toBe(true);
    expect(takeQuietAfterDecline(44001)).toBe(false);
  });

  it('is wired: the delivery marks only all-„no" batches on screen; the run withholds without a result', () => {
    expect(engine).toContain('answerOnlySaysNo(a.answer ??');
    expect(engine).toContain('noteQuietAfterDecline(threadId)');
    expect(chat).toContain(
      'if (ownerAbsent && takeQuietAfterDecline(threadId) && !broughtAResult(pending)) {',
    );
  });
});
