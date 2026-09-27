jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { userLanguage } from '../threads.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * ROW 260 / D505 — THE LANGUAGE A PERSON IS WRITTEN TO IN BEFORE THEY HAVE
 * WRITTEN A WORD.
 *
 * The first ask a stranger ever receives is composed before they have typed
 * anything, so this decision — not the translator — chooses what they are
 * handed. Until 27 September it was always Georgian, and an English reader got
 * Georgian with the translator never running at all: the asker's language and
 * the reader's matched, so the crossing was never detected. No model call, no
 * ledger row, no log line. The wall I fixed in `askTranslation.service` this
 * morning cannot see this case, because nothing reaches it.
 *
 * Tornike's ruling, 27 September, in his words: „Keep georgian if it is
 * georgian county code +995, if it's another country code switch to English,
 * and continue in language he responds".
 *
 * ⚠️ The number itself never leaves the database (D149): the query answers a
 * BOOLEAN, so no phone number exists in this function or anything that logs
 * around it. The first test holds that, because it is the kind of promise a
 * later „just add the number for debugging" quietly breaks.
 */
const noMessages = { rows: [], rowCount: 0 };

const withNumber = (georgian: boolean | null): void => {
  mockQuery
    .mockResolvedValueOnce(noMessages as never)
    .mockResolvedValueOnce({ rows: [{ georgian }], rowCount: 1 } as never);
};

beforeEach(() => jest.clearAllMocks());

describe('a stranger who has never written', () => {
  it('reads Georgian when the number is Georgian', async () => {
    withNumber(true);

    expect(await userLanguage('501')).toBe('ka');
  });

  it('reads English when the number carries another country code', async () => {
    withNumber(false);

    expect(await userLanguage('501')).toBe('en');
  });

  /**
   * „No number" is neither of the two cases the ruling names, and guessing
   * English there would be reading it past what it says. Georgian is the
   * behaviour that was already in place, so the unknown case changes nothing.
   */
  it('keeps Georgian when there is no number at all', async () => {
    withNumber(null);

    expect(await userLanguage('501')).toBe('ka');
  });

  it('asks the database for a yes or no, never for the number', async () => {
    withNumber(false);

    await userLanguage('501');

    const [sql] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('BOOL_OR');
    expect(sql).not.toMatch(/SELECT\s+phone|,\s*phone/i);
  });

  /** A read that fails must not decide the language by accident. */
  it('falls back to Georgian when the number cannot be read', async () => {
    mockQuery
      .mockResolvedValueOnce(noMessages as never)
      .mockRejectedValueOnce(new Error('timeout') as never);

    expect(await userLanguage('501')).toBe('ka');
  });
});

/**
 * AND THE OTHER HALF OF D505 — „continue in language he responds" — which
 * needed no building, because one message has always decided it. The test is
 * here so that the number can never start overruling a person who has spoken.
 */
describe('once they have written, the number is not consulted', () => {
  it('reads the conversation and asks nothing else', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ content: 'Do you know a good notary?' }],
      rowCount: 1,
    } as never);

    expect(await userLanguage('501')).toBe('en');
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
