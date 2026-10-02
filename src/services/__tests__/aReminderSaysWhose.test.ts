/**
 * The tester's 1008: a reader with two open questions got two identical
 * reminders. The line now names who is asking.
 */
import { askReminderLine } from '../taskAsks.service';
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
