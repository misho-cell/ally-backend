import { introOutcomeLine } from '../introOpening';

/** #1717: the refusal line quoted the refuser, said „შუამავალმა", and asked a question. */
describe('the refusal line', () => {
  const line = introOutcomeLine('ka', 'ნანა', false, false, 'ზაზა ძალიან დაკავებულია', 'ლიკა');

  it('never carries the refuser’s own words', () => {
    expect(line).not.toContain('ზაზა ძალიან დაკავებულია');
    expect(line).not.toContain('„');
  });

  it('names who said no, not „შუამავალი", and asks nothing', () => {
    expect(line).toContain('ლიკამ');
    expect(line).not.toContain('შუამავალ');
    expect(line).not.toContain('?');
  });

  it('still reads when the name is unknown, and in English', () => {
    expect(introOutcomeLine('ka', 'ნანა', false, false, null, null)).toBe(
      'ნანას გაცნობა ამჯერად ვერ მოხერხდა.',
    );
    expect(introOutcomeLine('en', 'Nana', false, false, 'busy', 'Lika')).toBe(
      'Lika could not make the introduction to Nana this time.',
    );
  });
});
