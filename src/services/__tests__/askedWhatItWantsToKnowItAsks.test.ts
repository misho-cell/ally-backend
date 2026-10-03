import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Board #509 (Ninia, 2 Oct, conversation 30562): „რა გინდა იცოდე ჩემზე?" was
 * answered with the one saved note and an invitation to share, and no
 * question. The personalization tool used to say only „ask at a moment that
 * genuinely fits"; the owner asking IS that moment, and now it says so.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
const tool = chat.slice(chat.indexOf("name: 'get_profile_question'"));

describe('get_profile_question when the owner asks what Netai wants to know', () => {
  it('is to be called, and one question asked', () => {
    const description = tool.slice(0, 2000);
    expect(description).toContain(
      'AND ALWAYS when the owner asks what you want to know about them',
    );
    expect(description).toContain('რა გინდა იცოდე ჩემზე?');
    expect(description).toContain('ONE question');
  });

  it('keeps the rule against asking at random moments', () => {
    expect(tool.slice(0, 2000)).toContain('never because a slot happens to be free');
  });
});
