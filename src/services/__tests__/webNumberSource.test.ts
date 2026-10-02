import { readFileSync } from 'fs';
import { join } from 'path';
import {
  historyWebResults,
  nationalForm,
  webNumberSpellings,
  webNumbersWithSource,
  wrapNumbers,
} from '../chat.service';
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

  it('finds a number in a result and names its page', () => {
    const out = webNumbersWithSource(
      result([
        {
          url: 'https://www.zugdidi-clinic.ge/contact',
          title: 'კონტაქტი',
          content: 'დაგვირეკეთ: +995 415 22 33 44',
        },
      ]),
    );

    expect(out).toEqual([
      { phone: '+995 415 22 33 44', source: 'https://www.zugdidi-clinic.ge/contact' },
    ]);
  });

  /**
   * Question A, the tester's 941 (thread 28448): every notary's number on
   * notary.ge came out as „[hidden]". web_search calls the page text `snippet`;
   * this function only ever read `content`, so no search number was allowed.
   */
  it('reads a search result’s snippet, where web_search puts the page text', () => {
    const out = webNumbersWithSource(
      result([
        {
          url: 'https://www.notary.ge/geo-3718-sanotaro-biuroebi-notary-580#top',
          title: 'მერაბ ჯიხვაშვილი',
          snippet: 'ქუთაისი, თამარ მეფის ქუჩა N62+995 591 70 66 45+995 579 132 424mjikh@notary.ge',
        },
      ]),
    );
    expect(out.map((n) => n.phone)).toEqual(['+995 591 70 66 45', '+995 579 132 424']);
    expect(out[0]?.source).toBe('https://www.notary.ge/geo-3718-sanotaro-biuroebi-notary-580');
  });

  it('takes only a web address as a page', () => {
    expect(
      webNumbersWithSource(result([{ url: 'ftp://x.ge/a', content: '+995 415 22 33 44' }])),
    ).toEqual([]);
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

  /**
   * AND THE TEST ABOVE PASSES WITHOUT THE FLOOR, WHICH MEANS IT WAS NOT
   * TESTING IT.
   *
   * Sabotage, 22 September: `if (phone.replace(/\D/g, '').length <
   * MIN_SHOWABLE_DIGITS) continue;` removed — every test in this file still
   * passed, that one included. „2015 წელს, 40" never reaches the floor at all:
   * the regex wants a digit, then six or more of [digit, space, dash,
   * brackets], then a digit, and Georgian letters break the run long before
   * that. So it was refused one step earlier and the line under test was never
   * consulted.
   *
   * These are runs the REGEX accepts and the FLOOR must refuse — seven and
   * eight digits, which is what a room number, a price list or a date range
   * looks like once the punctuation is in it. Without the floor each of them
   * is offered to the owner as somebody's phone number, with a source, which
   * is the shape of the guarantee row 139 is built on.
   */
  it.each([
    ['a room or extension list', '123-45-67'],
    ['an eight-digit reference', '12 34 56 78'],
  ])('refuses %s, which the regex accepts and the floor must not', (_what, text) => {
    const out = webNumbersWithSource(result([{ url: 'https://example.ge/x', content: text }]));

    expect(out).toEqual([]);
  });

  /**
   * The control, and the pair that makes the floor a floor rather than a wall:
   * nine digits is in, eight is out, and one digit is the whole difference.
   */
  it('takes nine digits and refuses eight', () => {
    const nine = webNumbersWithSource(
      result([{ url: 'https://example.ge/x', content: 'ტელ: 415-22-33-44' }]),
    );
    const eight = webNumbersWithSource(
      result([{ url: 'https://example.ge/x', content: 'ტელ: 415-22-33-4' }]),
    );

    expect(nine).toHaveLength(1);
    expect(eight).toEqual([]);
  });

  /**
   * AND WHAT THE FLOOR DOES NOT CATCH, written down rather than left for
   * somebody to find. „(2015) 2016-2024" carries twelve digits, so it clears a
   * nine-digit floor and is offered as a phone with a source. The floor is
   * about LENGTH and nothing else; telling a date range from a number needs
   * something this function does not have, and pretending otherwise in a test
   * would be worse than saying so here.
   */
  it('does not pretend to catch a long date range', () => {
    const out = webNumbersWithSource(
      result([{ url: 'https://example.ge/x', content: '(2015) 2016-2024' }]),
    );

    expect(out.length).toBeGreaterThan(0);
  });

  it('is bounded, so a runaway page cannot fill memory', () => {
    const many = Array.from({ length: 400 }, (_, i) => `+9954152${String(10000 + i)}`).join(' ');
    const out = webNumbersWithSource(result([{ url: 'https://example.ge/list', content: many }]));

    expect(out.length).toBeLessThanOrEqual(300);
  });

  /**
   * The tester's 948: a national registry listed 20+ other cities' notaries
   * first, and the old bound of 20 ran out before the Kutaisi ones were read.
   */
  it('reaches the people far down a long directory page', () => {
    const others = Array.from({ length: 60 }, (_, i) => `+9955991${String(10000 + i)}`).join(' ');
    const kutaisi = 'ქუთაისი, იოსებ გრიშაშვილის ქუჩა N14 +995 599 70 30 80';
    const out = webNumbersWithSource(
      result([{ url: 'https://napr.gov.ge/notaries', content: `${others} ${kutaisi}` }]),
    );
    expect(out.map((n) => n.phone)).toContain('+995 599 70 30 80');
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

  /**
   * CHANGED ON 1 OCTOBER, the tester's 961. This used to assert the opposite:
   * „(995) 415…" puts two characters between the 5 and the 4, and the matcher
   * spanned one, so the number was masked. That was caution about the wrong
   * thing — the DIGITS are identical, so it is the same allowed number, and
   * masking it hid a published phone every time a page or reply bracketed an
   * area code („551) …"). Two separator characters are allowed now; a single
   * different digit still masks it.
   */
  it('shows the same digits however they are punctuated, and nothing else', () => {
    expect(render('(995) 415.22.33.44')).not.toContain('[hidden]');
    expect(render('(995) 415.22.33.45')).toContain('[hidden]');
  });

  it('allows a city number printed with its trunk 0, as the reply writes it', () => {
    const spellings = webNumberSpellings('0422 27 33 44');
    expect(spellings).toContain('422 27 33 44');
    expect(spellings).toContain('+995 422 27 33 44');
  });

  it('does not repeat a source the text already gives', () => {
    const out = render(`${CLINIC} — zugdidi-clinic.ge`);

    expect(out.match(/zugdidi-clinic\.ge/g)).toHaveLength(1);
  });

  /** Question A, the tester's 944: a page link printed elsewhere in the reply is not printed again. */
  it('does not add a link the reply already gives anywhere', () => {
    const link = 'https://www.notary.ge/geo-3718';
    const linked = new Map<string, string | null>([[CLINIC, link]]);
    const reply = `ნოტარიუსი (${link}). ${'მისამართი: თამარ მეფის ქუჩა N62, ქუთაისი. '.repeat(2)}ტელ: ${CLINIC}`;
    const out = stripAllowedSpans(scrubText(wrapNumbers(reply, linked)));
    expect(out.split(link)).toHaveLength(2);
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

/**
 * Question A, the tester's 949 (thread 28716): a run answered from web results
 * an EARLIER run had fetched — and since the allowance was per run, every phone
 * came out „[hidden]". Web results already in the history now count too.
 */
describe('web results from earlier in the thread count for this run', () => {
  const page = {
    results: [
      {
        title: 'ეთერ გზირიშვილი',
        url: 'https://www.notary.ge/geo-3718-page-5',
        snippet: 'ქუთაისი N14 +995 599 70 30 80',
      },
    ],
  };

  it('finds a web result stored as a tool_result string', () => {
    const history = [
      {
        role: 'user' as const,
        content: [
          { type: 'tool_result' as const, tool_use_id: 'x', content: JSON.stringify(page) },
        ],
      },
    ];
    const found = historyWebResults(history);
    expect(found).toHaveLength(1);
    expect(webNumbersWithSource(found[0]).map((n) => n.phone)).toEqual(['+995 599 70 30 80']);
  });

  it('ignores plain-text tool results and the assistant’s own turns', () => {
    const history = [
      {
        role: 'user' as const,
        content: [{ type: 'tool_result' as const, tool_use_id: 'y', content: 'found: false http' }],
      },
      { role: 'assistant' as const, content: 'https://example.ge +995 599 12 34 56' },
    ];
    expect(historyWebResults(history)).toEqual([]);
  });

  it('is read when the run is built', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('registerHistoryWebResults(runId, history);');
  });
});

/**
 * Question A, the tester's 950: every Kutaisi phone was „[hidden]" because the
 * page printed „+995 599 70 30 80" and the reply wrote „599 70 30 80".
 */
describe('a Georgian number is allowed however it is written', () => {
  it('derives the national form of a +995 number', () => {
    expect(nationalForm('+995 599 70 30 80')).toBe('599 70 30 80');
    expect(nationalForm('995599703080')).toBe('599703080');
    expect(nationalForm('+1 202 555 0142')).toBeNull();
    expect(nationalForm('599 70 30 80')).toBeNull();
  });

  it("shows the reply's national spelling of a number the page printed with +995", () => {
    const found = webNumbersWithSource({
      results: [{ url: 'https://www.notary.ge/p5', snippet: 'N14 +995 599 70 30 80' }],
    });
    // As registerWebNumber holds it: the printed spelling and its national form.
    const held = new Map<string, string | null>(
      found.flatMap((n) => [
        [n.phone, n.source] as [string, string],
        ...(nationalForm(n.phone)
          ? [[nationalForm(n.phone) as string, n.source] as [string, string]]
          : []),
      ]),
    );
    const out = stripAllowedSpans(scrubText(wrapNumbers('ტელ: 599 70 30 80', held)));
    expect(out).toContain('599 70 30 80');
    expect(out).not.toContain('[hidden]');
  });
});

describe('both forms are registered at both web doors', () => {
  /**
   * The tester's 953: an opening search's numbers were never registered, so a
   * FRESH thread still showed „[hidden]". Every web door goes through one
   * function now: the model's web_search / fetch_page, the history, and the
   * opening search.
   */
  it('registers every web door through one function', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat.match(/registerWebNumber\(runId, phone, source\);/g)).toHaveLength(1);
    expect(chat).toContain('registerWebResult(runId, raw);');
    expect(chat).toContain(
      'for (const result of historyWebResults(history)) registerWebResult(runId, result);',
    );
    expect(chat).toContain(
      'if (found.webRaw !== undefined) registerWebResult(runId, found.webRaw);',
    );
    expect(chat).toContain(
      'for (const spelling of webNumberSpellings(phone)) registerAllowedNumber(runId, spelling, source);',
    );
  });
});

describe('the spellings one printed number may take', () => {
  it('splits an address number glued on by a full stop', () => {
    expect(webNumberSpellings('12. 422277343')).toEqual(['12. 422277343', '422277343']);
  });

  it('adds the national form of a +995 number, and keeps short parts out', () => {
    expect(webNumberSpellings('+995 570 50 61 64')).toEqual(['+995 570 50 61 64', '570 50 61 64']);
  });
});

/**
 * The tester's 992 (29580): a page printed several numbers back to back and
 * the reply showed „ტელეფონი ( და (" — each number, written on its own, was
 * masked because only the glued twenty-digit run was allowed.
 */
describe('numbers a page printed back to back', () => {
  const GLUED = '(0415) 22 33 44 599 11 22 33 599 44 55 66';
  const held = (): Map<string, string | null> =>
    new Map(
      webNumberSpellings(GLUED).map((s) => [s, 'https://audit.ge/zugdidi'] as [string, string]),
    );

  it.each(['(0415) 22 33 44', '599 11 22 33', '599 44 55 66'])('shows %s on its own', (one) => {
    const out = stripAllowedSpans(scrubText(wrapNumbers(`ტელეფონი ${one}`, held())));

    expect(out).toContain(one);
    expect(out).not.toContain('[hidden]');
  });

  it('still masks a number the page never printed', () => {
    const out = stripAllowedSpans(scrubText(wrapNumbers('ტელეფონი 577 12 34 56', held())));

    expect(out).toContain('[hidden]');
  });

  it('leaves a single printed number with its ordinary spellings', () => {
    expect(webNumberSpellings('+995 599 70 30 80')).toEqual(['+995 599 70 30 80', '599 70 30 80']);
  });
});

/**
 * The tester's 1014, thread 30132: every Kutaisi clinic's phone read
 * „ტელ: 568) 88 02 77". The page printed „(568) 88 02 77", the page read kept
 * „568) …", and the wrap wrote that spelling over the reply's own.
 */
describe('a number keeps its opening bracket', () => {
  const PAGE = 'https://www.yell.ge/companies.php?lan=geo&rub=420&SI_1=Kutaisi';
  const held = new Map<string, string | null>([['568) 88 02 77', PAGE]]);
  const render = (text: string): string => stripAllowedSpans(scrubText(wrapNumbers(text, held)));

  it('keeps the reply’s „(568) …" whole', () => {
    expect(render('ტელ: (568) 88 02 77')).toBe(`ტელ: (568) 88 02 77 (${PAGE})`);
  });

  it('gives a bracket that was never opened its pair', () => {
    expect(render('ტელ: 568) 88 02 77')).toBe(`ტელ: (568) 88 02 77 (${PAGE})`);
  });

  it('leaves a number with no brackets as the reply wrote it', () => {
    expect(render('ტელ: 568 88 02 77')).toBe(`ტელ: 568 88 02 77 (${PAGE})`);
  });

  it('names the page once when the number is written twice', () => {
    const out = render('ტელ: (568) 88 02 77, ისევ: 568 880 277');
    expect(out.split(PAGE).length - 1).toBe(1);
    expect(out).not.toContain('[hidden]');
  });

  it('leaves an own number the tool already marked exactly as it was', () => {
    const own = '⟦own⟧+995 599 11 22 33⟦/own⟧';
    expect(wrapNumbers(`შენი: ${own}`, held)).toBe(`შენი: ${own}`);
  });
});
