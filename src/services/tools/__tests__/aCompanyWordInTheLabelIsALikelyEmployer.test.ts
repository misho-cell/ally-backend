jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../../db/postgres/client';
import {
  asWritten,
  candidateWords,
  LIKELY_EMPLOYER_NOTE,
  LIKELY_EMPLOYER_ON,
  likelyEmployerFor,
  withLikelyEmployers,
} from '../likelyEmployer';

/**
 * 4657 (box 54353 test 1): a contact saved „<name> Arci" — asked where she
 * works, the run said the workplace is not in the record. A company word in
 * the owner's OWN label that other people hold as their employer is now
 * handed over as likely_employer, said as likely.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;

function answer(labels: string[], employer: string | null): void {
  mockQuery.mockImplementation(((sql: string) => {
    if (sql.includes('FROM "UserAlias"')) {
      return Promise.resolve({ rows: labels.map((label) => ({ label })), rowCount: labels.length });
    }
    const rows = employer === null ? [] : [{ word: employer, holders: 20 }];
    return Promise.resolve({ rows, rowCount: rows.length });
  }) as unknown as typeof query);
}

beforeEach(() => mockQuery.mockReset());

describe('the words a label offers', () => {
  it('gives each word and each adjacent pair once, lowercased; a short word only in a pair', () => {
    expect(candidateWords(['Eka Arci', 'GD Holding', 'eka'])).toEqual([
      'eka',
      'eka arci',
      'arci',
      'gd holding',
      'holding',
    ]);
  });

  it('keeps the owner’s own spelling of the matched word', () => {
    expect(asWritten(['Eka ARCI'], 'arci')).toBe('ARCI');
  });
});

describe('likelyEmployerFor', () => {
  it('is on since Misho’s yes (§132)', () => {
    expect(LIKELY_EMPLOYER_ON).toBe(true);
  });

  it('switched off, reads nothing', async () => {
    await expect(likelyEmployerFor('501', '+995599000111', false)).resolves.toEqual({});
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('names the company word other people work at, with its note', async () => {
    answer(['Eka Arci'], 'arci');
    await expect(likelyEmployerFor('501', '+995599000111', true)).resolves.toEqual({
      likely_employer: 'Arci',
      likely_employer_note: LIKELY_EMPLOYER_NOTE,
    });
  });

  it('reads only the owner’s own labels, and asks for two holders at least', async () => {
    answer(['Eka Arci'], 'arci');
    await likelyEmployerFor('501', '+995599000111', true);
    const [labelsSql, labelsParams] = mockQuery.mock.calls[0];
    expect(labelsSql).toContain('"contactId" = $1 AND phone = $2');
    expect(labelsParams?.slice(0, 2)).toEqual(['501', '+995599000111']);
    const [, employerParams] = mockQuery.mock.calls[1];
    expect(employerParams?.[1]).toBe(2);
  });

  // #7758 (tester 79009): „. Axel" in a label is a community, never an employer.
  it('never offers a community’s name as an employer', async () => {
    answer(['Ilia Test. Axel'], null);
    await likelyEmployerFor('501', '+995599000111', true);
    const [employerSql] = mockQuery.mock.calls[1];
    expect(String(employerSql)).toContain("m.field_type = 'member_of'");
    expect(String(employerSql)).toContain('WHERE NOT EXISTS (');
  });

  it('gives nothing when no word is anybody’s employer', async () => {
    answer(['Eka Tbilisi'], null);
    await expect(likelyEmployerFor('501', '+995599000111', true)).resolves.toEqual({});
  });

  it('gives nothing, and does not throw, when the read fails', async () => {
    mockQuery.mockRejectedValue(new Error('statement timeout'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(likelyEmployerFor('501', '+995599000111', true)).resolves.toEqual({});
  });
});

describe('the name search carries it too (tester 56332, §138)', () => {
  const FOUND = {
    found: true,
    results: [
      { phone: '+995500000201', name: 'Giorgi Testadze', employer: null },
      { phone: '+995500000202', name: 'Giorgi Satsdeli', employer: 'Bank A' },
    ],
  };

  it('adds the word to a row with no employer of its own, and the note once', async () => {
    answer(['Giorgi PwC'], 'pwc');
    const out = (await withLikelyEmployers('7', FOUND)) as {
      results: Record<string, unknown>[];
      likely_employer_note?: string;
    };
    expect(out.results[0].likely_employer).toBe('PwC');
    expect(out.results[1].likely_employer).toBeUndefined();
    expect(out.likely_employer_note).toBe(LIKELY_EMPLOYER_NOTE);
  });

  it('leaves the result untouched when no label holds a company word', async () => {
    answer(['Giorgi'], null);
    expect(await withLikelyEmployers('7', FOUND)).toBe(FOUND);
  });

  it('leaves a not-found result and a switched-off feature untouched', async () => {
    const none = { found: false, query: 'x' };
    expect(await withLikelyEmployers('7', none)).toBe(none);
    expect(await withLikelyEmployers('7', FOUND, false)).toBe(FOUND);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
