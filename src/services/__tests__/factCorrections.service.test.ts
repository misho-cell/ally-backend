jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../contactFacts.service', () => ({
  __esModule: true,
  retractOwnFacts: jest.fn().mockResolvedValue({ retracted: 2 }),
}));

import { query } from '../../db/postgres/client';
import { retractOwnFacts } from '../contactFacts.service';
import {
  correctContactFact,
  vetoedPhonesFor,
  claimWords,
  listCorrections,
} from '../factCorrections.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockRetract = retractOwnFacts as jest.MockedFunction<typeof retractOwnFacts>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue(rows([]) as never);
  mockRetract.mockResolvedValue({ retracted: 2 });
});

describe('claimWords — what a veto is actually made of', () => {
  it('keeps the words that carry the claim', () => {
    expect(claimWords('Angel Investor')).toEqual(['angel', 'investor']);
  });

  it('drops the words a negation is built from, so the veto is about the claim', () => {
    // „no longer active angel investor" vetoes „angel investor", not „active".
    expect(claimWords('no longer active angel investor')).toEqual(['angel', 'investor']);
  });

  it('has nothing to veto in a sentence with no claim in it', () => {
    expect(claimWords('არა, აღარ')).toEqual([]);
  });
});

describe('correctContactFact — the correction retracts AND vetoes', () => {
  it('retracts the caller’s own wrong rows and records the veto', async () => {
    const out = await correctContactFact('501', '+995599111111', 'Angel Investor', 'occupation');

    expect(out).toEqual({ corrected: true, retracted: 2 });
    expect(mockRetract).toHaveBeenCalledWith('501', '+995599111111', {
      fieldType: 'occupation',
      valueFragment: 'Angel Investor',
    });
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO fact_corrections');
    expect(sql).toContain('ON CONFLICT');
    expect(params[3]).toEqual(['angel', 'investor']);
  });

  it('never touches anyone else’s row — the veto is this user’s', async () => {
    await correctContactFact('501', '+995599111111', 'Angel Investor');

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('user_id');
    // retractOwnFacts is itself scoped to the caller's own submissions.
    expect(mockRetract.mock.calls[0][0]).toBe('501');
  });

  it('refuses a correction with no claim in it rather than vetoing everything', async () => {
    const out = await correctContactFact('501', '+995599111111', 'არა');

    expect(out.corrected).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses an empty claim', async () => {
    expect((await correctContactFact('501', '+995599111111', '   ')).corrected).toBe(false);
  });
});

describe('vetoedPhonesFor — the search layer’s own read', () => {
  it('fires when the query and the corrected claim share a word', async () => {
    mockQuery.mockResolvedValue(rows([{ contact_phone: '+995599111111' }]) as never);

    const out = await vetoedPhonesFor('501', ['investor', 'startups']);

    expect(out.has('+995599111111')).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('wrong_words && $2::text[]');
    expect(params).toEqual(['501', ['investor', 'startups']]);
  });

  it('asks nothing for an empty query', async () => {
    expect((await vetoedPhonesFor('501', [])).size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('listCorrections', () => {
  it('returns this user’s corrections, newest first', async () => {
    mockQuery.mockResolvedValue(
      rows([
        { contact_phone: '+995599111111', wrong_value: 'Angel Investor', created_at: 'now' },
      ]) as never,
    );

    expect(await listCorrections('501')).toHaveLength(1);
    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ORDER BY created_at DESC');
  });
});
