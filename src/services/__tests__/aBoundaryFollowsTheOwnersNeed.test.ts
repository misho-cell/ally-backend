import { readFileSync } from 'fs';
import { join } from 'path';
jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { boundaryExclusionsForOwnerLine, queryTerms } from '../askBoundary.service';
import { withoutWithheldPeople } from '../withoutWithheldPeople';

const mockQuery = query as jest.MockedFunction<typeof query>;

/** The tester's 68935 (thread 60773): Nika closed loans; the run searched „ბანკი". */
const OWNER_LINE = 'ბანკიდან სესხი მჭირდება ბიზნესის გასაფართოებლად';
const NIKA = '+995500000159';
const LEVAN = '+995500000158';
const WITHHELD: ReadonlySet<string> = new Set(['995500000159']);

describe('#1694: a search withholds whoever closed the subject the owner asked about', () => {
  beforeEach(() => mockQuery.mockReset());

  it('reads the boundary by the words of the owner’s line, not the search word', () => {
    expect(queryTerms(OWNER_LINE)).toContain('sesk');
    expect(queryTerms('ბანკი')).not.toContain('sesk');
  });

  it('returns the phones and never logs the owner’s words', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    mockQuery.mockResolvedValueOnce({ rows: [{ phone: NIKA }] } as never);
    await expect(boundaryExclusionsForOwnerLine(OWNER_LINE)).resolves.toEqual([NIKA]);
    expect(mockQuery.mock.calls[0][1]?.[0]).toContain('sesk');
    expect(log.mock.calls.flat().join(' ')).not.toContain('სესხი');
    log.mockRestore();
  });

  it('withholds nobody when the boundaries cannot be read', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    await expect(boundaryExclusionsForOwnerLine(OWNER_LINE)).resolves.toEqual([]);
    error.mockRestore();
  });
});

describe('#1694: the withheld person is absent from what the run sees', () => {
  it('drops the person found and counts what is left', () => {
    const shown = withoutWithheldPeople(
      {
        found: true,
        count: 2,
        results: [
          { name: 'ლევან', phone: LEVAN },
          { name: 'ნიკა', phone: NIKA },
        ],
      },
      WITHHELD,
    );
    expect(shown).toEqual({ found: true, count: 1, results: [{ name: 'ლევან', phone: LEVAN }] });
  });

  it('says nothing was found when only the withheld person was', () => {
    const shown = withoutWithheldPeople(
      { found: true, count: 1, results: [{ name: 'ნიკა', target_phone: NIKA }] },
      WITHHELD,
    );
    expect(shown).toEqual({ found: false, count: 0, results: [] });
  });

  it('drops a withheld go-between, and the row reached only through them', () => {
    const shown = withoutWithheldPeople(
      {
        results: [
          {
            name: 'ბანკირი',
            target_phone: '+995500000300',
            via_contacts: [{ name: 'ნიკა', phone: NIKA }],
          },
          {
            name: 'მენეჯერი',
            target_phone: '+995500000301',
            via_contacts: [
              { name: 'ნიკა', phone: NIKA },
              { name: 'ლევან', phone: LEVAN },
            ],
          },
        ],
        bridges: [
          { name: 'ნიკა', phone: NIKA, knows: 2 },
          { name: 'ლევან', phone: LEVAN, knows: 1 },
        ],
      },
      WITHHELD,
    );
    expect(shown).toEqual({
      results: [
        {
          name: 'მენეჯერი',
          target_phone: '+995500000301',
          via_contacts: [{ name: 'ლევან', phone: LEVAN }],
        },
      ],
      bridges: [{ name: 'ლევან', phone: LEVAN, knows: 1 }],
    });
  });

  it('drops a person further out whose first link is withheld', () => {
    const shown = withoutWithheldPeople(
      { further_out: [{ name: 'უფროსი', phone: '+995500000400', firstLinkPhone: NIKA }] },
      WITHHELD,
    );
    expect(shown).toEqual({ further_out: [] });
  });

  it('returns the very same result when nobody is withheld', () => {
    const result = { found: true, results: [{ name: 'ლევან', phone: LEVAN }] };
    expect(withoutWithheldPeople(result, WITHHELD)).toBe(result);
    expect(withoutWithheldPeople(result, new Set())).toBe(result);
  });
});

describe('#1694: wired into every search the run makes', () => {
  it('filters before the run notes who it found', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('const result = withoutWithheldPeople(found, withheld);');
    expect(chat).toContain('{ further_out: await farMembersHolding(Number(userId), words) },');
    expect(chat).toContain('runWithheldByOwnerLine.delete(runId);');
  });
});
