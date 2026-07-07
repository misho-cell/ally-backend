jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../costLedger.service', () => ({ recordClaudeUsage: jest.fn(), __esModule: true }));
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: jest.fn() } },
}));

import { query } from '../../db/postgres/client';
import anthropic from '../../config/anthropic';
import { submitContactFact } from '../contactFacts.service';
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

  it('does not query for other users\' facts when saving a note', async () => {
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
    expect(upsertSql).toContain("WHERE field_type <> 'note'");
  });
});
