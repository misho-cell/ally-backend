import { introOutcomeLine } from '../introOpening';

/** #1717: the refusal line quoted the refuser, said „შუამავალმა", and asked a question. */
describe('the refusal line', () => {
  const line = introOutcomeLine('ka', 'ნანა', false, false, 'ლიკა');

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
    expect(introOutcomeLine('ka', 'ნანა', false, false, null)).toBe(
      'ნანას გაცნობა ამჯერად ვერ მოხერხდა.',
    );
    expect(introOutcomeLine('en', 'Nana', false, false, 'Lika')).toBe(
      'Lika could not make the introduction to Nana this time.',
    );
  });
});

/** #1750 (D648): the yes line quotes nobody either; the run carries the meaning. */
describe('the yes line and the answer’s meaning', () => {
  const { introOutcomeEvent } = jest.requireActual('../taskEngine.events');

  it('quotes nothing', () => {
    const line = introOutcomeLine('ka', 'ნანა', true, false, 'ლიკა');
    expect(line).not.toContain('„');
    expect(line).not.toContain('პასუხი:');
  });

  it('hands the answer to the run, to pass in its own words', () => {
    const event = introOutcomeEvent('ნანა', false, 'kept_by_mediator', 'ლიკა', true, {
      answer: 'ქვეყანაში არ არის',
    });
    expect(event.ka).toContain('ქვეყანაში არ არის');
    expect(event.ka).toContain('არ დაუციტირო');
  });

  it('declines in the genitive: „გიორგის გაცნობა"', () => {
    expect(introOutcomeLine('ka', 'გიორგი', false, false, 'ლიკა')).toContain('გიორგის გაცნობა');
  });
});
