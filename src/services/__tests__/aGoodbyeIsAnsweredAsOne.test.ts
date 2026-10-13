import { readFileSync } from 'fs';
import { join } from 'path';
import { isFarewell, isGeorgianLine, isPlainThanks } from '../smallTalk';

/**
 * The tester's 44126 (#2114, conversations 41970 and 41980): „კარგად იყავი" was
 * answered as „how are you" both times, with a sample in the prompt. The
 * server knows a goodbye, and the turn is told it is one.
 */
describe('a goodbye', () => {
  it.each(['კარგად იყავი', 'კარგად იყავით!', 'ნახვამდის', 'დროებით', 'Bye'])(
    '„%s" is one',
    (line) => {
      expect(isFarewell(line)).toBe(true);
    },
  );

  it.each(['კარგად ხარ?', 'როგორ ხარ?', 'კარგად', 'ნახვამდის, და ნოტარიუსი მომიძებნე'])(
    '„%s" is not',
    (line) => {
      expect(isFarewell(line)).toBe(false);
    },
  );

  it('is told to the small-talk turn, in the tail that is not cached', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('buildTodaySection(new Date()) + smallTalkTurnNote(userMessage);');
    expect(chat).toContain('smallTalkAgentPrompt(userId, userMessage)');
    const note = chat.slice(chat.indexOf('const FAREWELL_TURN_NOTE ='));
    expect(note.slice(0, note.indexOf(';\n'))).toContain('„შენც კარგად იყავი!"');
  });
});

/** The tester's 44129 (42007): „მადლობა" was answered as „how are you". */
describe('a thank-you', () => {
  it.each(['მადლობა', 'მადლობა!', 'გმადლობთ', 'Thank you'])('„%s" is one', (line) => {
    expect(isPlainThanks(line)).toBe(true);
  });

  it('is told to the small-talk turn, after a goodbye is ruled out', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const fn = chat.slice(chat.indexOf('function smallTalkTurnNote('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body.indexOf('isFarewell(userMessage)')).toBeLessThan(
      body.indexOf('isPlainThanks(userMessage)'),
    );
    expect(body).toContain('return THANKS_TURN_NOTE;');
    expect(chat).toContain('„მადლობა" → „არაფრის! კიდევ რამეში დაგეხმარო?"); „როგორ ხარ"-ს');
  });
});

/**
 * The tester's 55870 (958 re-run): an English „thanks!" got „არაფრის! კიდევ
 * რამეში დაგეხმარო?". The Georgian turn note and its sample go only with a
 * Georgian line; another language's line gets no note and keeps its language.
 */
describe('a turn note goes only with a Georgian line', () => {
  it.each(['მადლობა!', 'კარგად იყავი', 'ok, მადლობა'])('„%s" is Georgian', (line) => {
    expect(isGeorgianLine(line)).toBe(true);
  });

  it.each(['thanks!', 'Thank you', 'Bye', 'спасибо', 'gracias'])('„%s" is not', (line) => {
    expect(isGeorgianLine(line)).toBe(false);
  });

  it('is checked before any note is chosen', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const fn = chat.slice(chat.indexOf('function smallTalkTurnNote('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain("if (!isGeorgianLine(userMessage)) return '';");
    expect(body.indexOf('isGeorgianLine(userMessage)')).toBeLessThan(
      body.indexOf('isFarewell(userMessage)'),
    );
  });
});
