jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../costLedger.service', () => ({ recordClaudeUsage: jest.fn(), __esModule: true }));
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: jest.fn() } },
}));

import { query } from '../../db/postgres/client';
import anthropic from '../../config/anthropic';
import { submitContactFact, getVisibleFacts } from '../contactFacts.service';
import { normalizePhone } from '../phone';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockCreate = (anthropic as unknown as { messages: { create: jest.Mock } }).messages.create;

const USER = '42';
const RAW_PHONE = '+995 555 00 00 01';
const PHONE = normalizePhone(RAW_PHONE);

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('submitContactFact — free-text notes (Option B)', () => {
  it('inserts a note as a private row without crowd-confirmation', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    const result = await submitContactFact(USER, RAW_PHONE, 'note', 'Approach via warm intro');

    expect(result).toEqual({ is_public: false, canonical_value: null });
    // Exactly one write, a plain INSERT (notes accumulate — never an upsert).
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql as string).toContain('INSERT INTO contact_facts');
    expect(sql as string).not.toContain('ON CONFLICT');
    expect(params as unknown[]).toEqual([PHONE, USER, 'note', 'Approach via warm intro']);
    // No semantic matching / crowd pass for notes.
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("does not query for other users' facts when saving a note", async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await submitContactFact(USER, RAW_PHONE, 'note', 'reminder');

    // The structured path issues a follow-up SELECT of other submitters' facts;
    // the note path must not — so there is only the single INSERT.
    const selects = mockQuery.mock.calls.filter((c) => (c[0] as string).includes('SELECT'));
    expect(selects).toHaveLength(0);
  });

  it('still upserts a structured fact via the partial-index arbiter', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([]) as never) // upsert
      .mockResolvedValueOnce(rows([]) as never); // getOtherFacts → none

    const result = await submitContactFact(USER, RAW_PHONE, 'employer', 'MKD Law');

    expect(result.is_public).toBe(false);
    const upsertSql = mockQuery.mock.calls[0][0] as string;
    expect(upsertSql).toContain('ON CONFLICT');
    expect(upsertSql).toContain("field_type IN ('occupation', 'employer', 'city', 'industry')");
  });

  it('reroutes a narrative-length core value to a private note (sensitive-text guard)', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);
    const narrative =
      'co-founder/CEO conflict; wants everything NOW and is frustrated with the board over ' +
      'equity split and control of the roadmap';

    const result = await submitContactFact(USER, RAW_PHONE, 'occupation', narrative);

    expect(result).toEqual({ is_public: false, canonical_value: null });
    // Saved as an accumulating private note — never through the crowd-capable upsert.
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql as string).not.toContain('ON CONFLICT');
    expect((params as unknown[])[2]).toBe('note');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('accumulates any non-core free-form key (role, skill, …) like a note', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    const result = await submitContactFact(USER, RAW_PHONE, 'Role', 'CEO @ Leavingstone');

    expect(result).toEqual({ is_public: false, canonical_value: null });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql as string).toContain('INSERT INTO contact_facts');
    expect(sql as string).not.toContain('ON CONFLICT');
    // field_type is normalized (trimmed + lowercased) before storage.
    expect(params as unknown[]).toEqual([PHONE, USER, 'role', 'CEO @ Leavingstone']);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('getVisibleFacts — owner value never hidden by the crowd (F1)', () => {
  function setup(own: unknown[], pub: unknown[]): void {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('submitted_by_user_id = $2')) return Promise.resolve(rows(own) as never);
      if (sql.includes('is_public = true')) return Promise.resolve(rows(pub) as never);
      throw new Error(`Unexpected query: ${sql}`);
    });
  }

  it("shows the owner's own value even when a crowd public value differs", async () => {
    setup(
      [{ field_type: 'employer', value: 'MKD Law', is_public: false }],
      [{ field_type: 'employer', canonical_value: 'Big Corp' }],
    );

    const { facts } = await getVisibleFacts(USER, RAW_PHONE);
    const employer = facts.filter((f) => f.field_type === 'employer');

    expect(employer).toHaveLength(1);
    expect(employer[0].value).toBe('MKD Law'); // own value, not the crowd's "Big Corp"
    expect(employer[0].is_public).toBe(false);
  });

  it('fills a field from the crowd only when the owner has no own value', async () => {
    setup([], [{ field_type: 'city', canonical_value: 'Tbilisi' }]);

    const { facts } = await getVisibleFacts(USER, RAW_PHONE);

    expect(facts).toEqual([{ field_type: 'city', value: 'Tbilisi', is_public: true }]);
  });
});
