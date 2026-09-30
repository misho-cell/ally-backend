import { APPROVE_LABEL, choiceNotesFor } from '../choiceNotes';
import { RunLanguage } from '../runLanguage';

const LANGUAGES: readonly RunLanguage[] = ['ka', 'en', 'ru', 'es'];

/**
 * ROW 306 — the frontend asked for a note ONLY where a tap does more than its
 * label admits. Approving a plan is the one: it lets Netai write to real
 * people in the owner's name, and „I approve" does not say so.
 */
describe('a note under the approve button, and under nothing else', () => {
  it('explains approval in the label’s own language', () => {
    for (const language of LANGUAGES) {
      const label = APPROVE_LABEL[language];
      const notes = choiceNotesFor([label, 'Change it']);
      expect(Object.keys(notes ?? {})).toEqual([label]);
    }
    expect(choiceNotesFor([APPROVE_LABEL.ka])?.[APPROVE_LABEL.ka]).toContain('შენი სახელით');
    expect(choiceNotesFor([APPROVE_LABEL.en])?.[APPROVE_LABEL.en]).toContain('in your name');
  });

  it('is absent when no button needs one', () => {
    expect(choiceNotesFor(['მოგვარებულია', 'ჯერ არა'])).toBeUndefined();
    expect(choiceNotesFor([])).toBeUndefined();
  });

  it('reads nothing into a missing or malformed choices field', () => {
    expect(choiceNotesFor(null)).toBeUndefined();
    expect(choiceNotesFor(undefined)).toBeUndefined();
    expect(choiceNotesFor([42, { label: 'I approve' }])).toBeUndefined();
  });
});
