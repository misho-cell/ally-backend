import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Tornike's 8 Nov report, #10: scheduled wakes with nothing new posted
 * „nothing has changed, so I'm not writing" to Lika, twice. A run the server
 * started already ends quietly on an empty reply; the wake now tells the run
 * that is the way to say nothing.
 */
const ENGINE = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');
const CHAT = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('a scheduled wake with nothing new', () => {
  it('is told an empty reply is the way to say nothing', () => {
    const text = ENGINE.slice(ENGINE.indexOf('const SCHEDULED_WAKE_TEXT ='));
    expect(text.slice(0, 400)).toContain('პასუხი ცარიელი დატოვე');
    expect(text.slice(0, 400)).toContain('არასდროს დაწერო, რომ არაფერს წერ.');
  });

  it('and an empty reply really is said as nothing', () => {
    expect(CHAT).toContain("if (!/[\\p{L}\\p{N}]/u.test(effectiveFinal)) effectiveFinal = '';");
  });
});
