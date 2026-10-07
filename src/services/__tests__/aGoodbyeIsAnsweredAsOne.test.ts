import { readFileSync } from 'fs';
import { join } from 'path';
import { isFarewell } from '../smallTalk';

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
    expect(chat).toContain(
      "buildTodaySection(new Date()) + (isFarewell(userMessage) ? FAREWELL_TURN_NOTE : '');",
    );
    expect(chat).toContain('smallTalkAgentPrompt(userId, userMessage)');
    const note = chat.slice(chat.indexOf('const FAREWELL_TURN_NOTE ='));
    expect(note.slice(0, note.indexOf(';\n'))).toContain('„შენც კარგად იყავი!"');
  });
});
