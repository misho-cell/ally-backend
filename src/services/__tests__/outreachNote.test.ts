import { outreachNoteFor } from '../taskEngine.service';
import { AskBudgetState } from '../askBudget.service';

function budget(overrides: Partial<AskBudgetState>): AskBudgetState {
  return {
    monthly_budget_base: 30,
    ladder: 1,
    fatigue_signals: { opt_outs_caused: 0, asks_ignored: 0, total: 0 },
    fatigue_window_days: 60,
    fatigue_step_down_per_signal: 5,
    min_monthly_budget: 5,
    effective_monthly_budget: 30,
    sent_this_month: 0,
    remaining_this_month: 30,
    window: 'calendar_month',
    window_resets_at: '2026-10-01T00:00:00.000Z',
    relay_messages_per_person_per_day: 4,
    ...overrides,
  };
}

describe('what a goal wake is told about the ask budget (ticket 9 task 17)', () => {
  it('says nothing while there is room — a plan needs no lecture it cannot use', () => {
    expect(outreachNoteFor(budget({ remaining_this_month: 1 }))).toBe('');
  });

  it('stops the wake proposing a send the tool would refuse, and names the reset date', () => {
    // Four goals woke every night offering asks while the account had none
    // left, and each run promised the founder something nothing could deliver.
    const note = outreachNoteFor(budget({ remaining_this_month: 0 }));

    expect(note).toContain('ask_contact');
    expect(note).toContain('2026-10-01');
    expect(note).toContain('ნურაფერს');
  });

  it('leaves a live relayed conversation alone — that spends a different budget', () => {
    const note = outreachNoteFor(budget({ remaining_this_month: 0 }));

    expect(note).toContain('უკვე დაწყებული');
  });

  it('says nothing at all when the budget could not be read — silence beats a guess', () => {
    expect(outreachNoteFor(null)).toBe('');
  });
});
