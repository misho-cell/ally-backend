import { readFileSync } from 'fs';
import { join } from 'path';
import { withoutInternalText } from '../internalText';

/** The tester's 47325 (goal 22290): „permission_granted ჯერ არ არის…" reached the owner. */
describe('internal words never reach the owner', () => {
  it('drops the sentences of goal 22290 and keeps the question', () => {
    const reply =
      'permission_granted ჯერ არ არის ამ დავალებაზე, ოუნერს ჯერ არ დაუმტკიცებია გეგმა. ასე რომ ამ ეტაპზე ვერავის მივწერ.\n\n' +
      'ოუნერ y14, ველოდები შენს დასტურს: დავიწყო ირმასთან საუბარი სანტექნიკოსზე?';
    expect(withoutInternalText(reply)).toBe('ასე რომ ამ ეტაპზე ვერავის მივწერ.');
  });

  it('leaves links and ordinary replies alone', () => {
    const reply = 'ნახე აქ: https://example.com/some_page?a_b=1 — კარგი ხელოსანია.';
    expect(withoutInternalText(reply)).toBe(reply);
    expect(withoutInternalText('გეგმა მზადაა. დავიწყო?')).toBe('გეგმა მზადაა. დავიწყო?');
    expect(withoutInternalText('მისი ფოსტაა john_doe@example.com.')).toBe(
      'მისი ფოსტაა john_doe@example.com.',
    );
  });

  it('never empties a reply', () => {
    expect(withoutInternalText('set_task_wake')).toBe('set_task_wake');
  });

  it('runs on every reply, the server-started ones too', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('finalText = withoutInternalText(finalText);');
  });
});
