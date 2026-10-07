/**
 * The tester's 1008: a reader with two open questions got two identical
 * reminders. The line now names who is asking.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { askReminderLine, askReminderMessage } from '../taskAsks.service';
import { RUN_STRINGS } from '../runLanguage';

describe('askReminderLine', () => {
  it('names the asker in every language', () => {
    expect(askReminderLine('en', 'Nino')).toContain("Nino's question");
    expect(askReminderLine('ru', 'Nino')).toContain('Nino');
    expect(askReminderLine('es', 'Nino')).toContain('Nino');
    expect(askReminderLine('ka', 'ნინო')).toContain('ნინოს კითხვა');
  });

  it('keeps the old line when there is no name', () => {
    expect(askReminderLine('en', null)).toBe(RUN_STRINGS.en.askReminder);
    expect(askReminderLine('ka', null)).toBe(RUN_STRINGS.ka.askReminder);
  });
});

/** #2146: a question back from „later" came without itself and without its buttons. */
describe('askReminderMessage', () => {
  it('carries the question again under the reminder line', () => {
    const text = askReminderMessage('en', 'Nino', 'Do you know a good notary?');
    expect(text).toBe(`${askReminderLine('en', 'Nino')}\n\nDo you know a good notary?`);
  });

  it('is saved with the buttons that fit the question', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    const sweep = asks.slice(asks.indexOf('export async function sendDueAskReminders('));
    expect(sweep).toContain('RETURNING ask_thread_id, to_user_id, question,');
    expect(sweep).toContain('askReminderMessage(language, row.asker_name, relayed.text)');
    expect(sweep).toContain('askChoicesFor(row.question, language)');
  });
});
