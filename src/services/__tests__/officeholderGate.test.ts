import {
  applyOfficeholderGate,
  clearRunEvidence,
  nameCandidates,
  recordRunEvidence,
} from '../officeholderGate';

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
  it('leaves a name the run read on a page', () => {
    recordRunEvidence(
      RUN,
      JSON.stringify({ url: 'https://mof.ge', content: 'მინისტრი ლაშა ხუციშვილმა…' }),
    );

    const out = applyOfficeholderGate('ფინანსთა მინისტრი არის ლაშა ხუციშვილი.', RUN, 'ka');

    expect(out.refused).toEqual([]);
    expect(out.reply).toBe('ფინანსთა მინისტრი არის ლაშა ხუციშვილი.');
  });

  it('replaces a name no page carried with the scripted line', () => {
    recordRunEvidence(RUN, 'ვინ არის ფინანსთა მინისტრი?');

    const out = applyOfficeholderGate(
      'ფინანსთა მინისტრი არის გიორგი კობახიძე. მას შეგიძლია მისწერო.',
      RUN,
      'ka',
    );

    expect(out.refused).toEqual(['გიორგი კობახიძე']);
    expect(out.reply).toBe(
      'ფინანსთა მინისტრი არის (სახელი ვერ დავადასტურე ოფიციალურ გვერდზე). მას შეგიძლია მისწერო.',
    );
  });

  it('accepts a Georgian name that the read page carried in Latin letters', () => {
    recordRunEvidence(RUN, 'Minister of Finance: Lasha Khutsishvili');

    const out = applyOfficeholderGate('მინისტრი არის ლაშა ხუციშვილი.', RUN, 'ka');

    expect(out.refused).toEqual([]);
  });

  it('accepts a name the user typed themselves', () => {
    recordRunEvidence(RUN, 'How do I reach Nika Gilauri, the head of the agency?');

    const out = applyOfficeholderGate(
      'Nika Gilauri, the head of the agency, is in your network.',
      RUN,
      'en',
    );

    expect(out.refused).toEqual([]);
  });

  it('English: an unverified officeholder name is replaced', () => {
    recordRunEvidence(RUN, 'who runs the revenue service');

    const out = applyOfficeholderGate(
      'The head of the Revenue Service is Levan Kakava.',
      RUN,
      'en',
    );

    expect(out.reply).toBe(
      'The head of the Revenue Service is (name not verified on an official page).',
    );
  });

  it('a sentence without an office word is never touched', () => {
    const out = applyOfficeholderGate('Giorgi Beridze saved your number last week.', RUN, 'en');

    expect(out.refused).toEqual([]);
    expect(out.reply).toBe('Giorgi Beridze saved your number last week.');
  });

  it('a FORMER holder is history and stays', () => {
    const out = applyOfficeholderGate('ყოფილი მინისტრი ნოდარ ხადური ახლა კონსულტანტია.', RUN, 'ka');

    expect(out.refused).toEqual([]);
  });

  it('a run with no evidence at all still gets the line, not a name', () => {
    const out = applyOfficeholderGate('The CEO is Archil Gachechiladze.', undefined, 'en');

    expect(out.refused).toEqual(['Archil Gachechiladze']);
  });
});
