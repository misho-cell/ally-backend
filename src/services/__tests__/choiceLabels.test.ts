jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { canonicalChoiceLabel, isApproveLabel, isChangeLabel } from '../chat.service';

describe('canonicalChoiceLabel (Ticket 16 Task 96)', () => {
  it('maps a misspelt approve or change button to the two words the prompt names', () => {
    expect(canonicalChoiceLabel('დამადასტურებრი')).toBe('ვამტკიცებ');
    // The old wording, still typed by a model and still stored in every
    // thread written before 17 September, lands on the new one.
    expect(canonicalChoiceLabel('დამტკიცებულია')).toBe('ვამტკიცებ');
    expect(canonicalChoiceLabel('შევცვალო')).toBe('შევცვალოთ');
    expect(canonicalChoiceLabel('შევცვალოთ გეგმა')).toBe('შევცვალოთ');
    // Read live on 11 September on a real plan, and it slipped through.
    expect(canonicalChoiceLabel('შეცვლა')).toBe('შევცვალოთ');
    expect(canonicalChoiceLabel('დავამტკიცებ')).toBe('ვამტკიცებ');
  });

  it('leaves every other button alone', () => {
    expect(canonicalChoiceLabel('ტექსტები გამომიგზავნე, თვითონ მივწერ')).toBe(
      'ტექსტები გამომიგზავნე, თვითონ მივწერ',
    );
    expect(canonicalChoiceLabel('Tiko Inglisuri — ასწავლის ინგლისურს')).toBe(
      'Tiko Inglisuri — ასწავლის ინგლისურს',
    );
  });
});

/**
 * The seat's #4061 (h), last piece — and the reason it is a refactor rather
 * than a string swap.
 *
 * There was ONE canonical label and four places compared against it, one of
 * which decides whether a tap counted as the owner's approval. That is the
 * switch that lets a run write to real people. Localizing a value that is also
 * an identity is how two of those places end up agreeing about the language
 * and the third does not — so what is SHOWN and what a label MEANS are now two
 * different questions.
 */
describe('what the button says, and what it means', () => {
  it('shows the label in the conversation’s language', () => {
    expect(canonicalChoiceLabel('დამტკიცებულია', 'en')).toBe('I approve');
    expect(canonicalChoiceLabel('შეცვლა', 'en')).toBe('Change it');
    expect(canonicalChoiceLabel('დამტკიცებულია', 'ru')).toBe('Подтверждаю');
    expect(canonicalChoiceLabel('დამტკიცებულია', 'es')).toBe('Lo apruebo');
  });

  it('keeps Georgian for a caller that names no language', () => {
    expect(canonicalChoiceLabel('დამტკიცებულია')).toBe('ვამტკიცებ');
  });

  it('MEANS approve whatever language it was written in', () => {
    // The predicate is asked of a label stored days ago, of a tap arriving
    // now, and of whatever the model typed. None of the three carries a
    // language with it.
    for (const said of [
      'ვამტკიცებ',
      'დამტკიცებულია',
      'დამადასტურებრი',
      'approve',
      'I approve',
      'Подтверждаю',
      'Lo apruebo',
    ]) {
      expect(isApproveLabel(said)).toBe(true);
    }
  });

  it('MEANS change whatever language it was written in', () => {
    for (const said of [
      'შევცვალოთ',
      'შეცვლა',
      'Change it',
      'change the plan',
      'Изменить',
      'Cambiarlo',
    ]) {
      expect(isChangeLabel(said)).toBe(true);
    }
  });

  it('a display label round-trips: what we showed reads as approval when tapped', () => {
    // The tap is stored as the owner's own message, so the word on the button
    // has to be a word the matcher knows.
    for (const lang of ['ka', 'en', 'ru', 'es'] as const) {
      expect(isApproveLabel(canonicalChoiceLabel('დამტკიცებულია', lang))).toBe(true);
      expect(isChangeLabel(canonicalChoiceLabel('შეცვლა', lang))).toBe(true);
    }
  });

  it('keeps the word-count ceiling, which is the whole safety margin', () => {
    // Failing to see an approval costs a second tap. Seeing one that was not
    // given starts writing to real people. So a sentence that merely contains
    // the word is not the button.
    expect(isApproveLabel('approve the budget with the finance team first')).toBe(false);
    expect(isApproveLabel('დამტკიცებულია იყო თუ არა, არ ვიცი')).toBe(false);
  });

  it('does not read an ordinary answer as either button', () => {
    expect(isApproveLabel('ტექსტები გამომიგზავნე')).toBe(false);
    expect(isChangeLabel('Tiko Inglisuri')).toBe(false);
  });
});
