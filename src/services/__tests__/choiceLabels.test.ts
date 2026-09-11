jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { canonicalChoiceLabel } from '../chat.service';

describe('canonicalChoiceLabel (Ticket 16 Task 96)', () => {
  it('maps a misspelt approve or change button to the two words the prompt names', () => {
    expect(canonicalChoiceLabel('დამადასტურებრი')).toBe('დამტკიცებულია');
    expect(canonicalChoiceLabel('დამტკიცებულია')).toBe('დამტკიცებულია');
    expect(canonicalChoiceLabel('შევცვალო')).toBe('შევცვალოთ');
    expect(canonicalChoiceLabel('შევცვალოთ გეგმა')).toBe('შევცვალოთ');
    // Read live on 11 September on a real plan, and it slipped through.
    expect(canonicalChoiceLabel('შეცვლა')).toBe('შევცვალოთ');
    expect(canonicalChoiceLabel('დავამტკიცებ')).toBe('დამტკიცებულია');
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
