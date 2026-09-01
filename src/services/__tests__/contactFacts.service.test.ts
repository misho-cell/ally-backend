jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordClaudeUsage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: jest.fn() } },
}));

import { query } from '../../db/postgres/client';
import anthropic from '../../config/anthropic';
import {
  submitContactFact,
  getVisibleFacts,
  retractFactsFromForeignSync,
  hardDeleteOwnFact,
} from '../contactFacts.service';
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

// The agent-moderation call: resolves the publicity verdict the model returns.
function mockModeration(publicVerdict: boolean): void {
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({ public: publicVerdict }) }],
    usage: { input_tokens: 1, output_tokens: 1 },
  });
}

function insertCall(): [string, unknown[]] {
  const call = mockQuery.mock.calls.find(([sql]) =>
    (sql as string).includes('INSERT INTO contact_facts'),
  );
  return [call?.[0] as string, call?.[1] as unknown[]];
}

describe("retractFactsFromForeignSync — ticket 6 P0 (25 Aug): a foreign contact sync filed as this account's own submissions", () => {
  it("scopes to source=label facts on rows whose (phone, alias) exists byte-for-byte under the sync source's OWN phonebook", async () => {
    mockQuery.mockResolvedValue(rows([]) as never);
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 62 } as never);

    const out = await retractFactsFromForeignSync('501', '118509');

    expect(out).toEqual({ retracted: 62 });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql as string).toContain("cf.source = 'label'");
    expect(sql as string).toContain('SET retracted_at = NOW()');
    expect(sql as string).toContain('is_public = false');
    expect(params).toEqual(['501', '118509']);
  });

  it('never touches a fact with a different source (manual research, chat) just because it shares a phone with the contamination', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await retractFactsFromForeignSync('501', '118509');

    const [sql] = mockQuery.mock.calls[0];
    // The source filter is a hard condition inside the same UPDATE, not a
    // separate pass — a fact with source IS NULL or source='chat' never
    // matches this WHERE clause regardless of the alias-overlap subquery.
    expect(sql as string).toMatch(/AND cf\.source = 'label'/);
  });

  it("returns 0 when nothing in this account matches the sync source's phonebook", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const out = await retractFactsFromForeignSync('501', '999999');

    expect(out).toEqual({ retracted: 0 });
  });
});

describe('hardDeleteOwnFact — engine T14 (memory mirror), "forget this", genuinely irreversible', () => {
  it('issues a real DELETE, not an UPDATE — the row must not survive at all', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    const out = await hardDeleteOwnFact(USER, RAW_PHONE, 'note', 'old address');

    expect(out).toEqual({ deleted: 1 });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql as string).toContain('DELETE FROM contact_facts');
    expect(sql as string).not.toContain('retracted_at = NOW()');
    expect(params).toEqual([PHONE, USER, 'note', 'old address']);
  });

  it('does NOT require retracted_at IS NULL — an already-retracted row must still be erasable', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await hardDeleteOwnFact(USER, RAW_PHONE);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql as string).not.toContain('retracted_at IS NULL');
  });

  it("is scoped to the caller's own submissions only, same as retraction", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await hardDeleteOwnFact(USER, RAW_PHONE);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql as string).toContain('submitted_by_user_id = $2');
  });
});

describe('submitContactFact — free-text notes (agent-moderated publicity)', () => {
  it('inserts a note as a PRIVATE row when the agent rules it personal', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);
    mockModeration(false);

    const result = await submitContactFact(USER, RAW_PHONE, 'note', 'Approach via warm intro');

    expect(result).toEqual({ is_public: false, canonical_value: null });
    // One dedupe scan + one plain INSERT (notes accumulate — never an upsert).
    const [sql, params] = insertCall();
    expect(sql as string).toContain('INSERT INTO contact_facts');
    expect(sql as string).not.toContain('ON CONFLICT');
    expect(params as unknown[]).toEqual([
      PHONE,
      USER,
      'note',
      'Approach via warm intro',
      false,
      'chat',
      'stated',
    ]);
  });

  it('inserts a note as a PUBLIC row when the agent rules it professional', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);
    mockModeration(true);

    const result = await submitContactFact(USER, RAW_PHONE, 'note', 'Fintech product manager');

    expect(result.is_public).toBe(true);
    const [, params] = insertCall();
    expect((params as unknown[])[4]).toBe(true);
  });

  it('reads a FENCED verdict — the bug that kept every fact private for two months', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);
    // Verbatim reply shape from claude-haiku-4-5 (captured live, 1 Sep):
    // the old bare JSON.parse threw on this and failed closed, every time.
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '```json\n{"public": true}\n```' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    const result = await submitContactFact(USER, RAW_PHONE, 'education', 'Harvard MBA');

    expect(result.is_public).toBe(true);
  });

  it('stays private (fail-closed) when the moderation call fails', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);
    mockCreate.mockRejectedValue(new Error('model down'));

    const result = await submitContactFact(USER, RAW_PHONE, 'note', 'anything');

    expect(result.is_public).toBe(false);
    expect(insertCall()[1][4]).toBe(false);
  });

  it("does not query for other users' facts when saving a note", async () => {
    mockQuery.mockResolvedValue(rows([]) as never);
    mockModeration(false);

    await submitContactFact(USER, RAW_PHONE, 'note', 'reminder');

    // The structured path issues a follow-up SELECT of OTHER submitters' facts;
    // the note path's only SELECT is the dedupe scan over the user's OWN rows.
    const selects = mockQuery.mock.calls.filter((c) => (c[0] as string).includes('SELECT'));
    for (const [sql] of selects) {
      expect(sql as string).toContain('submitted_by_user_id = $2');
    }
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

  it("publishes a TRUSTED CURATOR's core fact immediately — no second source, no model call", async () => {
    process.env.TRUSTED_FACT_CURATOR_USER_IDS = '501';
    mockQuery.mockResolvedValue(rows([]) as never);

    const result = await submitContactFact('501', RAW_PHONE, 'occupation', 'იურისტი');

    // The founder's ruling (1 Sep): his value IS the canonical, straight away.
    expect(result).toEqual({ is_public: true, canonical_value: 'იურისტი' });
    const publish = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('SET is_public = true'),
    );
    expect(publish?.[1]).toEqual(['იურისტი', PHONE, '501', 'occupation']);
    // No crowd matching runs for a curator — nobody else has to agree.
    expect(mockCreate).not.toHaveBeenCalled();
    delete process.env.TRUSTED_FACT_CURATOR_USER_IDS;
  });

  it('keeps the two-source rule for everyone who is NOT a curator', async () => {
    process.env.TRUSTED_FACT_CURATOR_USER_IDS = '501';
    mockQuery.mockResolvedValue(rows([]) as never);

    const result = await submitContactFact(USER, RAW_PHONE, 'occupation', 'იურისტი');

    expect(result).toEqual({ is_public: false, canonical_value: null });
    const publish = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('SET is_public = true'),
    );
    expect(publish).toBeUndefined();
    delete process.env.TRUSTED_FACT_CURATOR_USER_IDS;
  });

  it('reroutes a narrative-length core value to a note, never the crowd upsert', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);
    mockModeration(false);
    const narrative =
      'co-founder/CEO conflict; wants everything NOW and is frustrated with the board over ' +
      'equity split and control of the roadmap';

    const result = await submitContactFact(USER, RAW_PHONE, 'occupation', narrative);

    expect(result).toEqual({ is_public: false, canonical_value: null });
    // Saved as an accumulating note — never through the crowd-capable upsert,
    // and never through crowd canonicalization (only the moderation call runs).
    const [sql, params] = insertCall();
    expect(sql as string).not.toContain('ON CONFLICT');
    expect((params as unknown[])[2]).toBe('note');
    expect(
      mockCreate.mock.calls.some((c) =>
        String((c[0] as { messages: { content: string }[] }).messages[0].content).includes(
          'matching_indices',
        ),
      ),
    ).toBe(false);
  });

  it('accumulates any non-core free-form key (role, skill, …) like a note', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);
    mockModeration(false);

    const result = await submitContactFact(USER, RAW_PHONE, 'Role', 'CEO @ Leavingstone');

    expect(result).toEqual({ is_public: false, canonical_value: null });
    const [sql, params] = insertCall();
    expect(sql as string).toContain('INSERT INTO contact_facts');
    expect(sql as string).not.toContain('ON CONFLICT');
    // field_type is normalized (trimmed + lowercased) before storage.
    expect(params as unknown[]).toEqual([
      PHONE,
      USER,
      'role',
      'CEO @ Leavingstone',
      false,
      'chat',
      'stated',
    ]);
  });

  it('a repeat of the SAME statement refreshes the existing row instead of piling up (4B.6)', async () => {
    mockModeration(false);
    mockQuery.mockImplementation((sql: string) => {
      if ((sql as string).includes('SELECT id, value'))
        return Promise.resolve(
          rows([{ id: 9, value: 'ძალიან ახლო მეგობარი — თითქმის ყოველდღე საუბრობენ' }]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });

    await submitContactFact(
      USER,
      RAW_PHONE,
      'note',
      'ძალიან ახლო მეგობარი, თითქმის ყოველდღე საუბრობენ!',
    );

    // Beso carried FIVE copies of this sentence, saved on five days.
    const update = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('SET updated_at = NOW()'),
    );
    expect(update?.[1]).toEqual([9]);
    expect(
      mockQuery.mock.calls.some(([sql]) => (sql as string).includes('INSERT INTO contact_facts')),
    ).toBe(false);
  });

  it('a genuinely different note still accumulates', async () => {
    mockModeration(false);
    mockQuery.mockImplementation((sql: string) => {
      if ((sql as string).includes('SELECT id, value'))
        return Promise.resolve(rows([{ id: 9, value: 'ახლო მეგობარი' }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    await submitContactFact(USER, RAW_PHONE, 'note', 'აშენებს ახალ სახლს კახეთში');

    expect(
      mockQuery.mock.calls.some(([sql]) => (sql as string).includes('INSERT INTO contact_facts')),
    ).toBe(true);
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
