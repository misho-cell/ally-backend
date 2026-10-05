import { readFileSync } from 'fs';
import { join } from 'path';
import { askPushTitle } from '../taskAsks.service';

/** #1420 (Giorgi): the push said „<friend> is asking you" where the app said the friend's assistant. */
describe('the push says whose assistant asks', () => {
  it('names the assistant in every language', () => {
    expect(askPushTitle('ka', 'ნინო ბერიძე')).toBe('Netai — ნინო ბერიძის ასისტენტი გეკითხება');
    expect(askPushTitle('en', 'Nino')).toBe("Netai — Nino's assistant is asking you");
    expect(askPushTitle('ru', 'Nino')).toContain('ассистент Nino');
    expect(askPushTitle('es', 'Nino')).toContain('el asistente de Nino');
  });

  it('is what the ask push and the introduction push say', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain('title: askPushTitle(language, senderName)');
    expect(asks).not.toContain('`Netai — ${senderName} გეკითხება`');
    const intro = readFileSync(join(__dirname, '..', 'tools', 'requestIntroduction.ts'), 'utf8');
    expect(intro).toContain('ასისტენტი გთხოვს, გააცნო');
  });
});
