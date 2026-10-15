import { readFileSync } from 'fs';
import { join } from 'path';

import { chosenLanguageDecides } from '../runLanguage';

/** 5285 (Lika №27): English chosen in the app, an English question, a Georgian answer. */
describe('the language chosen in the app', () => {
  it('decides when the line says the same, or nothing about language', () => {
    expect(chosenLanguageDecides('en', 'Who do I know in marketing?')).toBe(true);
    expect(chosenLanguageDecides('en', '👍')).toBe(true);
  });

  it('gives way to a line written in another language, and to no choice at all', () => {
    expect(chosenLanguageDecides('en', 'ვინ ვიცნობ მარკეტინგში?')).toBe(false);
    expect(chosenLanguageDecides(null, 'Who do I know in marketing?')).toBe(false);
  });

  it('is read from the app header for an owner run, and asked before D752', () => {
    const route = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'threads.routes.ts'),
      'utf8',
    );
    expect(route).toContain("chosenLanguage: asRunLanguage(req.get('X-Locale')),");
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const chosenAt = chat.indexOf(
      'const chosen = ownerAbsent ? null : (intent?.chosenLanguage ?? null);',
    );
    const askedAt = chat.indexOf(
      "// D752: the owner's own request for a language wins over everything read above.",
    );
    expect(chosenAt).toBeGreaterThan(-1);
    expect(askedAt).toBeGreaterThan(chosenAt);
  });
});
