import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 3106 (speed). The owner's earlier lines and the saved language preference
 * were read one after the other, after the prompt was built, each a ~145 ms
 * round trip before the model was called. They depend on nothing the build
 * does, so they start beside it and are awaited where they were awaited.
 */
describe('the run language reads start beside the prompt build', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const namedAt = chat.indexOf("steps.mark('named');");
  const buildAt = chat.indexOf("'prompt',", namedAt);
  const run = chat.slice(namedAt);

  it('starts both reads before the prompt build', () => {
    const spokenAt = chat.indexOf('const spokenBeforeRead = ownerMessages(threadId)', namedAt);
    const savedAt = chat.indexOf('const savedLanguageRead = languagePreference(userId)', namedAt);
    expect(namedAt).toBeGreaterThan(-1);
    expect(spokenAt).toBeGreaterThan(namedAt);
    expect(savedAt).toBeGreaterThan(namedAt);
    expect(buildAt).toBeGreaterThan(spokenAt);
    expect(buildAt).toBeGreaterThan(savedAt);
  });

  it('reads the owner lines only through the early read', () => {
    expect(run).toContain('const spokenBefore = await spokenBeforeRead;');
    expect(run).not.toContain('const spokenBefore = await ownerMessages(threadId)');
  });

  it('still saves a language the owner asks for in this line', () => {
    expect(run).toContain('ownerAbsent || requestedLanguage(userMessage) === null');
    expect(run).toContain(': await askedLanguage(userId, userMessage);');
  });

  it('logs a failed preference read instead of dropping it', () => {
    const read = run.slice(run.indexOf('const savedLanguageRead'));
    const body = read.slice(0, read.indexOf('});'));
    expect(body).toContain('[language-preference]');
    expect(body).toContain('return null;');
  });
});
