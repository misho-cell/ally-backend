import { readFileSync } from 'fs';
import { join } from 'path';
import { withoutInvisibleCharacters } from '../chat.service';

/**
 * The tester's 962 (thread 28944, 14:34:09Z): a reply of one zero-width
 * character was saved with a single button — an empty bubble. `trim()` keeps
 * U+200B, so the run's empty-final checks never saw it.
 */
describe('an invisible reply is an empty reply', () => {
  it('drops zero-width characters, and nothing else', () => {
    expect(withoutInvisibleCharacters('​').trim()).toBe('');
    expect(withoutInvisibleCharacters('﻿‌‍⁠')).toBe('');
    expect(withoutInvisibleCharacters('კი​, გაუგზავნე')).toBe('კი, გაუგზავნე');
  });

  it('is applied before the final reply is checked for being empty', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('let effectiveFinal = withoutInvisibleCharacters(finalText);');
  });
});
