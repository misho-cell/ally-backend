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

/** Tester 75902 (thread 65176): a bare invite link turned a Georgian helper's run English. */
describe('a link on its own', () => {
  const link = 'https://app.example.com/invite?t=x6nuzcvcm6tsq2mudq&preview=whatsapp';

  it('says nothing about language, so the conversation decides', () => {
    expect(carriesLanguage(link)).toBe(false);
    expect(languageOfConversation(link, ['მაქვს და გავუგზავნი'], 'en')).toBe('ka');
    expect(languageOfConversation(`ეს არის ბმული ${link}`, [], 'en')).toBe('ka');
  });

  it('still lets an English sentence around it decide', () => {
    expect(
      languageOfConversation(
        `Here is the invite link for the group, please share it: ${link}`,
        ['გამარჯობა'],
        'ka',
      ),
    ).toBe('en');
  });
});
