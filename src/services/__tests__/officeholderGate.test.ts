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
