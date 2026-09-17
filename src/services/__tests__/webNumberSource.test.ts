import { webNumbersWithSource, wrapNumbers } from '../chat.service';
import { scrubText, stripAllowedSpans } from '../privacyScrub';

/**
 * Ticket 20 row 139 — public business numbers, and the page they came from.
 *
 * Tornike's rule: a business's own public number found on the web is shown,
 * WITH ITS SOURCE; a private person's number never is.
 *
 * Goal 3699 / thread 15810: the plan message showed a Zugdidi clinic's web
 * number in full while the step copy of the same plan masked it. One text, two
 * surfaces, two answers — and the surface that showed it was the one with no
 * phone scrub at all.
 *
 * WHAT THE SERVER CAN AND CANNOT ESTABLISH, because the difference matters and
 * is easy to overclaim. It cannot tell a clinic's number from a private
 * person's number printed on the same page. What it CAN establish is that the
 * number was on a public page THIS RUN fetched, and which page — so the source
 * is not decoration, it is the whole of the guarantee.
 */
describe('webNumbersWithSource', () => {
  const result = (rows: unknown[]) => ({ results: rows });

  it('finds a number in a result and names its domain', () => {
    const out = webNumbersWithSource(
      result([
        {
          url: 'https://www.zugdidi-clinic.ge/contact',
          title: 'კონტაქტი',
          content: 'დაგვირეკეთ: +995 415 22 33 44',
        },
      ]),
    );

    expect(out).toEqual([{ phone: '+995 415 22 33 44', source: 'zugdidi-clinic.ge' }]);
  });

  it('reads the title as well as the body', () => {
    const out = webNumbersWithSource(
      result([{ url: 'https://example.ge/x', title: 'კლინიკა 995415223344', content: '' }]),
    );

    expect(out[0]?.phone).toBe('995415223344');
  });

  it('ignores a result with no usable page behind it', () => {
    // Without a source there is nothing to show the number WITH, and the
    // source is the guarantee — so a sourceless number is not allowed at all.
    expect(webNumbersWithSource(result([{ title: 'x', content: '+995 415 22 33 44' }]))).toEqual(
      [],
    );
    expect(
      webNumbersWithSource(result([{ url: 'not a url', content: '+995 415 22 33 44' }])),
    ).toEqual([]);
  });

  it('ignores runs of digits too short to be a phone', () => {
    // The same nine-digit floor privacyScrub uses, so the two cannot disagree
    // about what a phone is.
    const out = webNumbersWithSource(
      result([{ url: 'https://example.ge/x', content: 'დაარსდა 2015 წელს, 40 ექიმი' }]),
    );

    expect(out).toEqual([]);
  });

  it('is bounded, so one directory page cannot fill a run', () => {
    const many = Array.from({ length: 40 }, (_, i) => `+99541522${String(1000 + i)}`).join(' ');
    const out = webNumbersWithSource(result([{ url: 'https://example.ge/list', content: many }]));

    expect(out.length).toBeLessThanOrEqual(20);
  });

  it('answers nothing for a shape it does not recognise, rather than guessing', () => {
    expect(webNumbersWithSource(null)).toEqual([]);
    expect(webNumbersWithSource({ guidance: 'something else' })).toEqual([]);
    expect(webNumbersWithSource({ results: 'not an array' })).toEqual([]);
  });
});

/**
 * Row 139's composition, which is the row itself: wrap, then scrub. Either
 * half alone is a leak or a blank.
 */
describe('a public number survives the scrub; every other one does not', () => {
  const CLINIC = '+995 415 22 33 44';
  const PRIVATE = '+995 599 12 34 56';
  const held = new Map<string, string | null>([[CLINIC, 'zugdidi-clinic.ge']]);

  const render = (text: string): string => stripAllowedSpans(scrubText(wrapNumbers(text, held)));

  it('keeps the web number and names its page', () => {
    expect(render(`კლინიკის ნომერი: ${CLINIC}`)).toBe(
      'კლინიკის ნომერი: +995 415 22 33 44 (zugdidi-clinic.ge)',
    );
  });

  it('masks a number no web page published, in the same sentence', () => {
    // The half that matters most. Tornike's rule has two clauses and a fix
    // that only honours the first one is a leak.
    const out = render(`კლინიკა ${CLINIC}, ექიმი ${PRIVATE}`);

    expect(out).toContain('415 22 33 44');
    expect(out).not.toContain('599 12 34 56');
    expect(out).toContain('[hidden]');
  });

  it('matches the number however the text spells it, within one separator', () => {
    // A model reformats freely, so the allowance is about the number rather
    // than one spelling of it: any single space, dash, dot or bracket between
    // digits still matches.
    expect(render('995-415-22-33-44')).toContain('(zugdidi-clinic.ge)');
    expect(render('995.415.22.33.44')).toContain('(zugdidi-clinic.ge)');
    expect(render('+995 415 223 344')).toContain('(zugdidi-clinic.ge)');
  });

  it('masks rather than shows when it cannot be sure it is the same number', () => {
    // „(995) 415…" puts TWO characters between the 5 and the 4, which the
    // matcher does not span. The number is then masked instead of shown, and
    // that is the failure worth having: widening the matcher would widen what
    // counts as „this exact allowed number", and the cost of being wrong here
    // is showing a number nobody allowed.
    expect(render('(995) 415.22.33.44')).toContain('[hidden]');
  });

  it('does not repeat a source the text already gives', () => {
    const out = render(`${CLINIC} — zugdidi-clinic.ge`);

    expect(out.match(/zugdidi-clinic\.ge/g)).toHaveLength(1);
  });

  it('adds no source to a number that has none — the user’s own', () => {
    // registerAllowedNumber's other caller is the user's own number, which
    // comes from their account and not from a page.
    const own = new Map<string, string | null>([[CLINIC, null]]);
    const out = stripAllowedSpans(scrubText(wrapNumbers(`შენი ნომერი: ${CLINIC}`, own)));

    expect(out).toBe('შენი ნომერი: +995 415 22 33 44');
  });

  it('is a no-op when the run allowed nothing', () => {
    expect(wrapNumbers('რამე +995 599 12 34 56', undefined)).toBe('რამე +995 599 12 34 56');
    expect(scrubText(wrapNumbers(`x ${PRIVATE}`, new Map()))).toContain('[hidden]');
  });
});
