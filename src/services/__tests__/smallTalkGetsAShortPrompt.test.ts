import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #958 (the tester's 1136–1138): a listed small-talk line waited about two
 * seconds for the full prompt. It gets a short one: who, how, the first name
 * only (37359 greeted with name and surname) and today's date.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('a listed small-talk line', () => {
  it('is given the short prompt instead of building the full one', () => {
    expect(chat).toContain(
      'const listedSmallTalk = !ownerAbsent && isToolFreeSmallTalk(userMessage);',
    );
    expect(chat).toContain('? smallTalkAgentPrompt(userId)');
  });

  it('names the owner by first name only, and knows the date', () => {
    const fn = chat.slice(chat.indexOf('async function smallTalkAgentPrompt('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('greetingName(await registeredName(userId))');
    expect(body).toContain('buildTodaySection(new Date())');
    expect(chat).toContain('მხოლოდ სახელით, გვარის გარეშე');
  });

  it('never runs for a turn the system started', () => {
    expect(chat).toContain('!ownerAbsent && isToolFreeSmallTalk(userMessage)');
  });

  it('is given correct Georgian forms to copy, and never calls the owner Netai (#2114)', () => {
    const prompt = chat.slice(chat.indexOf('const SMALL_TALK_GEORGIAN ='));
    const text = prompt.slice(0, prompt.indexOf(';\n'));
    expect(text).toContain('„კარგად, მადლობა! შენ როგორ ხარ?"');
    expect(text).toContain('„არაფრის! კიდევ რამეში დაგეხმარო?"');
    expect(text).toContain('„გამარჯობა! რით დაგეხმარო?"');
    expect(text).toContain('„კარგად, მადლობა რომ მკითხე! შენ?"');
    expect(text).toContain('„ნახვამდის! კარგად იყავი."');
    expect(text).toContain('მფლობელს Netai-ს ნუ უწოდებ');
    expect(chat).toMatch(/საკუთარ შესაძლებლობებზე არ ილაპარაკო\.' \+\s+SMALL_TALK_GEORGIAN;/u);
  });
});
