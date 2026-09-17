jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn().mockResolvedValue({ rows: [{ found: false }], rowCount: 1 }),
}));

import { query } from '../../db/postgres/client';
import {
  applyOfficeholderGate,
  clearRunEvidence,
  nameCandidates,
  recordRunEvidence,
  replaceNameWithPlaceholder,
} from '../officeholderGate';

const mockQuery = query as jest.MockedFunction<typeof query>;

// Ticket 12 Task 46 (D151): an official's name only from a page actually
// read — otherwise the scripted line. The gate reads the run's evidence (the
// user's words, tool results, fetched pages) and rewrites nothing else.

const RUN = 'run-46';

afterEach(() => clearRunEvidence(RUN));

describe('nameCandidates', () => {
  it('finds a Latin two-word name and skips institutions', () => {
    expect(
      nameCandidates('The Minister of Finance is Lasha Khutsishvili at Tbilisi City Hall.'),
    ).toEqual(['Lasha Khutsishvili']);
  });

  it('finds a Georgian name by its surname ending and skips ordinary words', () => {
    expect(nameCandidates('ფინანსთა მინისტრი არის ლაშა ხუციშვილი, დიდი კომპანია არა.')).toEqual([
      'ლაშა ხუციშვილი',
    ]);
  });
});

describe('applyOfficeholderGate', () => {
  it('leaves a name the run read on a page', async () => {
    recordRunEvidence(
      RUN,
      JSON.stringify({ url: 'https://mof.ge', content: 'მინისტრი ლაშა ხუციშვილმა…' }),
    );

    const out = await applyOfficeholderGate('ფინანსთა მინისტრი არის ლაშა ხუციშვილი.', RUN, 'ka');

    expect(out.refused).toEqual([]);
    expect(out.reply).toBe('ფინანსთა მინისტრი არის ლაშა ხუციშვილი.');
  });

  it('replaces a name no page carried with the scripted line', async () => {
    recordRunEvidence(RUN, 'ვინ არის ფინანსთა მინისტრი?');

    const out = await applyOfficeholderGate(
      'ფინანსთა მინისტრი არის გიორგი კობახიძე. მას შეგიძლია მისწერო.',
      RUN,
      'ka',
    );

    expect(out.refused).toEqual(['გიორგი კობახიძე']);
    expect(out.reply).toBe(
      'ფინანსთა მინისტრი არის (სახელი ვერ დავადასტურე ოფიციალურ გვერდზე). მას შეგიძლია მისწერო.',
    );
  });

  it('accepts a Georgian name that the read page carried in Latin letters', async () => {
    recordRunEvidence(RUN, 'Minister of Finance: Lasha Khutsishvili');

    const out = await applyOfficeholderGate('მინისტრი არის ლაშა ხუციშვილი.', RUN, 'ka');

    expect(out.refused).toEqual([]);
  });

  it('accepts a name the user typed themselves', async () => {
    recordRunEvidence(RUN, 'How do I reach Nika Gilauri, the head of the agency?');

    const out = await applyOfficeholderGate(
      'Nika Gilauri, the head of the agency, is in your network.',
      RUN,
      'en',
    );

    expect(out.refused).toEqual([]);
  });

  it('English: an unverified officeholder name is replaced', async () => {
    recordRunEvidence(RUN, 'who runs the revenue service');

    const out = await applyOfficeholderGate(
      'The head of the Revenue Service is Levan Kakava.',
      RUN,
      'en',
    );

    expect(out.reply).toBe(
      'The head of the Revenue Service is (name not verified on an official page).',
    );
  });

  it('a sentence without an office word is never touched', async () => {
    const out = await applyOfficeholderGate(
      'Giorgi Beridze saved your number last week.',
      RUN,
      'en',
    );

    expect(out.refused).toEqual([]);
    expect(out.reply).toBe('Giorgi Beridze saved your number last week.');
  });

  it('a FORMER holder is history and stays', async () => {
    const out = await applyOfficeholderGate(
      'ყოფილი მინისტრი ნოდარ ხადური ახლა კონსულტანტია.',
      RUN,
      'ka',
    );

    expect(out.refused).toEqual([]);
  });

  it('a run with no evidence at all still gets the line, not a name', async () => {
    const out = await applyOfficeholderGate('The CEO is Archil Gachechiladze.', undefined, 'en');

    expect(out.refused).toEqual(['Archil Gachechiladze']);
  });
});

describe('applyOfficeholderGate — the user’s own phonebook (Ticket 14 B7)', () => {
  it('keeps a name that sits in the user’s own labels even without tool evidence', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ found: true }], rowCount: 1 } as never);

    const out = await applyOfficeholderGate(
      'Arci-ს დირექტორი არის ბესო ორთოიძე.',
      RUN,
      'ka',
      '501',
    );

    expect(out.refused).toEqual([]);
    expect(out.reply).toContain('ბესო ორთოიძე');
    const [sql, params] = mockQuery.mock.calls[mockQuery.mock.calls.length - 1] as [
      string,
      unknown[],
    ];
    expect(sql).toContain('"UserAlias"');
    expect(params[0]).toBe('501');
  });

  it('still replaces a name that is neither in the evidence nor in the phonebook', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ found: false }], rowCount: 1 } as never);

    const out = await applyOfficeholderGate('მინისტრი არის ლაშა ხუციშვილი.', RUN, 'ka', '501');

    expect(out.refused).toEqual(['ლაშა ხუციშვილი']);
  });
});

/**
 * This gate is the last thing between the model and the person waiting, and it
 * used to look every name up one at a time, with a five-second timeout each and
 * no cap on how many names a reply can hold. Six officeholders in one answer is
 * thirty seconds added to a reply that is already late.
 *
 * Found on 16 September by going looking for the shape that cost
 * get_pending_updates 74,871 ms: N queries in series, each honouring its own
 * budget, nothing honouring the answer's.
 */
describe('the gate cannot make the reply wait for ever', () => {
  const OFFICE = (name: string): string => `${name} არის შემოსავლების სამსახურის უფროსი.`;

  beforeEach(() => {
    mockQuery.mockClear();
    mockQuery.mockResolvedValue({ rows: [{ found: false }], rowCount: 1 } as never);
  });

  it('asks about a repeated name ONCE, however many sentences carry it', async () => {
    const reply = [OFFICE('ლევან კაკავა'), OFFICE('ლევან კაკავა'), OFFICE('ლევან კაკავა')].join(
      ' ',
    );

    const out = await applyOfficeholderGate(reply, undefined, 'ka', '501');

    expect(mockQuery).toHaveBeenCalledTimes(1);
    // And every occurrence is still rewritten — the dedupe is in the lookups,
    // not in the replacement.
    expect(out.reply).not.toContain('ლევან კაკავა');
  });

  it('gives up on the lookups when the budget is spent, and refuses the name', async () => {
    jest.resetModules();
    process.env.OFFICEHOLDER_GATE_BUDGET_MS = '10';
    const slow = (await import('../../db/postgres/client')).query as jest.MockedFunction<
      typeof query
    >;
    slow.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ rows: [{ found: true }], rowCount: 1 } as never), 25),
        ),
    );
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fresh = await import('../officeholderGate');

    const reply = ['ნინო ბერიძე', 'გიორგი ლომაია', 'დათო ქავთარაძე', 'ეკა წერეთელი']
      .map(OFFICE)
      .join(' ');
    const out = await fresh.applyOfficeholderGate(reply, undefined, 'ka', '501');

    // Not one query per name: the clock stopped it part-way.
    expect(slow.mock.calls.length).toBeLessThan(4);
    // And the names it could not check were REFUSED, not waved through. That
    // direction is the whole point — the gate exists to stop the product
    // naming an officeholder it cannot show evidence for.
    expect(out.refused.length).toBeGreaterThan(0);
    expect(String(spy.mock.calls.at(-1)?.[0])).toContain('budget spent');

    spy.mockRestore();
    delete process.env.OFFICEHOLDER_GATE_BUDGET_MS;
  });
});

/**
 * Thread 15676, 16 September — the placeholder wore a Georgian case ending.
 *
 * The reply reached the person as „(სახელი ვერ დავადასტურე ოფიციალურ
 * გვერდზე)ა". The „ა" is the copula that was glued to the name („კალაძეა" =
 * „is Kaladze"); a plain split/join took the name out from underneath it and
 * left its grammar sitting on the bracket, so the placeholder reads as though
 * it were itself somebody's name with an ending on it.
 */
describe('the placeholder does not inherit the name’s grammar', () => {
  const PH = '(სახელი ვერ დავადასტურე ოფიციალურ გვერდზე)';

  it.each([
    ['თბილისის მერი კახა კალაძეა.', 'თბილისის მერი (X).'],
    ['კახა კალაძეს ვკითხე.', '(X) ვკითხე.'],
    ['კახა კალაძემ თქვა.', '(X) თქვა.'],
    ['მერია კახა კალაძე.', 'მერია (X).'],
  ])('%s', (input, shape) => {
    const out = replaceNameWithPlaceholder(input, 'კახა კალაძე', PH);
    expect(out).toBe(shape.replace('(X)', PH));
  });

  it('leaves a Latin name alone apart from the swap', () => {
    expect(replaceNameWithPlaceholder('John Smith is the mayor.', 'John Smith', PH)).toBe(
      `${PH} is the mayor.`,
    );
  });

  it('replaces every occurrence, each with its own ending', () => {
    const out = replaceNameWithPlaceholder('კახა კალაძემ და კახა კალაძეს', 'კახა კალაძე', PH);
    expect(out).toBe(`${PH} და ${PH}`);
  });

  it('a name with regex characters in it is not a pattern', () => {
    expect(replaceNameWithPlaceholder('A.B Smith spoke.', 'A.B Smith', PH)).toBe(`${PH} spoke.`);
  });
});

/**
 * Ticket 20 row 154 — a company is not an officeholder.
 *
 * Tornike's choice of 17 September, option (a). On thread 16106 the 07:32
 * reply listed four marketing agencies and one came out as the scripted note,
 * followed by the words the earlier reply had used for Infinity Solutions. The
 * Latin rule is „two capitalised words in a row", which „Infinity Solutions"
 * satisfies as neatly as a person's name — and web snippets are deliberately
 * not evidence, so a company the web found could never verify itself.
 */
describe('row 154 — the gate leaves company names alone', () => {
  const sentence = (s: string): string => s;

  it('does not treat „Infinity Solutions" as a person holding an office', () => {
    expect(
      nameCandidates(sentence('The director of Infinity Solutions handles branding.')),
    ).not.toContain('Infinity Solutions');
  });

  it('covers the company word in either half', () => {
    expect(nameCandidates('The CEO of Media Group runs it.')).not.toContain('Media Group');
    expect(nameCandidates('The head of Digital Partners spoke.')).not.toContain('Digital Partners');
  });

  /**
   * The half that must not break. D151 is unchanged for PEOPLE: a company
   * wrongly kept shows an organisation's name the run did not verify, which is
   * mild; a person wrongly skipped is somebody named as a minister on no
   * evidence at all.
   */
  it('still catches a real person in the same sentence', () => {
    const out = nameCandidates('The director of Infinity Solutions is Giorgi Kapanadze.');

    expect(out).toContain('Giorgi Kapanadze');
    expect(out).not.toContain('Infinity Solutions');
  });

  it('leaves an ordinary two-word person name exactly as it was', () => {
    expect(nameCandidates('The minister is Lasha Khutsishvili today.')).toContain(
      'Lasha Khutsishvili',
    );
  });

  it('a Georgian surname is untouched by the company list', () => {
    expect(nameCandidates('მინისტრი არის ლაშა ხუციშვილი.')).toContain('ლაშა ხუციშვილი');
  });
});
