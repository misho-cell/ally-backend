import { readFileSync } from 'fs';
import { join } from 'path';
import { firstNamesIn } from '../firstNameNamed';

/**
 * 4357 (tester box 51184, conv 49179): „ჰკითხე ნიკას" for the contact saved as
 * „ნიკა ხელოსანი" was not read as the owner naming him, and the owner said yes
 * three times before the question went.
 */
describe('the first names a line names', () => {
  it.each([
    ['კარგი, გააგრძელე. ჰკითხე ნიკას, ხომ არ იცნობს ნოტარიუსს.', ['ნიკა']],
    ['ჰკითხე გიორგის და ნინოს', ['გიორგი', 'ნინო']],
    ['Ask Nika about a notary', ['nika']],
  ])('„%s" → %j', (line, names) => {
    expect(firstNamesIn(line)).toEqual(names);
  });

  it('is nothing for a line with no first name', () => {
    expect(firstNamesIn('კარგი, გააგრძელე.')).toEqual([]);
  });
});

describe('the owner-named gate', () => {
  const service = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

  it('falls back to the first name only when no whole label is in the line', () => {
    expect(service).toContain(
      'if (best === undefined) return onlyContactByFirstName(line, person);',
    );
  });

  it('counts the first name only when exactly one contact carries it, and it is this one', () => {
    expect(service).toContain(
      'return distinct.size === 1 && distinct.has(phoneDigits(person.contactPhone));',
    );
    expect(service).toContain("SPLIT_PART(LOWER(TRIM(ua.alias)), ' ', 1) = ANY($2::text[])");
  });
});
