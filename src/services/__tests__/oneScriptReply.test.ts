import { readFileSync } from 'fs';
import { join } from 'path';
import { withoutStrayGeorgian } from '../oneScriptReply';

/** The tester's 47588: an English answer ended on a Georgian closing line. */
describe('an English reply never ends on a Georgian paragraph (47588)', () => {
  it('the tester’s reply loses its Georgian closing line', () => {
    const reply =
      'Levan Mogoniladze is your direct contact and is saved as a lawyer.\n\n' +
      'რამე სხვა გჭირდება ამასთან დაკავშირებით?';
    expect(withoutStrayGeorgian(reply, 'en')).toBe(
      'Levan Mogoniladze is your direct contact and is saved as a lawyer.',
    );
  });

  it('a Georgian name or label inside an English sentence stays', () => {
    const reply = 'You saved him as „ლევან იურისტი ვაკე". Shall I ask him?';
    expect(withoutStrayGeorgian(reply, 'en')).toBe(reply);
  });

  it('a list paragraph of Georgian names with English words stays', () => {
    const reply = 'Here they are:\n\nავთო გამოგონილი — electrician\nნინო საცდელაძე — lawyer';
    expect(withoutStrayGeorgian(reply, 'en')).toBe(reply);
  });

  it('a Georgian conversation is never touched', () => {
    const reply = 'Levan is a lawyer.\n\nრამე სხვა გჭირდება ამასთან დაკავშირებით?';
    expect(withoutStrayGeorgian(reply, 'ka')).toBe(reply);
  });

  it('a reply that is all Georgian is left for the checks that judge it', () => {
    const reply = 'ლევანი იურისტია.\n\nრამე სხვა გჭირდება ამასთან დაკავშირებით?';
    expect(withoutStrayGeorgian(reply, 'en')).toBe(reply);
  });

  it('a Russian reply loses a Georgian paragraph too', () => {
    const reply = 'Леван — юрист.\n\nრამე სხვა გჭირდება ამასთან დაკავშირებით?';
    expect(withoutStrayGeorgian(reply, 'ru')).toBe('Леван — юрист.');
  });

  it('runs in the reply guards', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('finalText = withoutStrayGeorgian(finalText, runLang(runId));');
  });
});
