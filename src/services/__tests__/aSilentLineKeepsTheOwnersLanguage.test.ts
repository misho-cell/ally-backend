import { readFileSync } from 'fs';
import { join } from 'path';
import { carriesLanguage, languageOfConversation } from '../runLanguage';

/**
 * 2410 (F18, 2 of 2 seats): a bare „." from an owner who writes Georgian — and
 * a file opening a conversation — was answered in English. A line that says
 * nothing about its language, in a conversation that says nothing either,
 * keeps the language the owner writes in elsewhere.
 */
describe('a silent line keeps the owner’s own language (2410)', () => {
  it('„." carries no language, so the fallback decides', () => {
    expect(carriesLanguage('.')).toBe(false);
    expect(languageOfConversation('.', [], 'ka')).toBe('ka');
  });

  it('the main run takes that fallback from the owner’s other conversations', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      '!ownerAbsent && !carriesLanguage(userMessage) && !spokenBefore.some(carriesLanguage);',
    );
    expect(chat).toContain(
      'silentHere ? await userLanguage(userId).catch(() => language) : language,',
    );
  });
});
