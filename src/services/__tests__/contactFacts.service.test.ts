jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordClaudeUsage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: jest.fn() } },
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import anthropic from '../../config/anthropic';
import {
  submitContactFact,
  getVisibleFacts,
  retractFactsFromForeignSync,
  hardDeleteOwnFact,
  isNearDuplicateFact,
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
  mockVisibility(publicVerdict ? 'public' : 'private');
}

// The moderator's three-state verdict (the founder's 1 Sep ruling).
function mockVisibility(visibility: 'public' | 'matchable' | 'private'): void {
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({ visibility }) }],
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
    // is_public, then is_matchable — the founder's third state sits between
    // "shown to everyone" and "the author's alone", and a private verdict is
    // neither.
    expect(params as unknown[]).toEqual([
      PHONE,
      USER,
      'note',
      'Approach via warm intro',
      false,
      false,
      'chat',
      'stated',
    ]);
  });

  it('stores a MATCHABLE note: usable for finding people, never shown', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);
    mockVisibility('matchable');

    const result = await submitContactFact(USER, RAW_PHONE, 'note', 'ზურას ახლო მეგობარი');

    // Not public — the text must never be displayed or quoted…
    expect(result.is_public).toBe(false);
    const [sql, params] = insertCall();
    expect((params as unknown[])[4]).toBe(false);
    // …but matchable, so the search can still put this person forward.
    expect((params as unknown[])[5]).toBe(true);
    // And no canonical_value: a matchable row carries nothing showable.
    expect(sql as string).toContain('CASE WHEN $5 THEN $4 END');
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
      content: [{ type: 'text', text: '```json\n{"visibility": "public"}\n```' }],
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

  it("does NOT publish a SWEEP's guess, even on the curator's own account", async () => {
    // Live on 4 September: „occupation: ქოუჩი" about a real person went
    // network-public from one unverified source, because the sweep wrote it
    // under the founder's id. D80 publishes what a curator RECORDS; a
    // background job guessing from their conversation is not that.
    process.env.TRUSTED_FACT_CURATOR_USER_IDS = '501';
    mockQuery.mockResolvedValue(rows([]) as never);

    const result = await submitContactFact('501', RAW_PHONE, 'occupation', 'ქოუჩი', 'sweep');

    expect(result).toEqual({ is_public: false, canonical_value: null });
    expect(
      mockQuery.mock.calls.find(([sql]) => (sql as string).includes('SET is_public = true')),
    ).toBeUndefined();
    delete process.env.TRUSTED_FACT_CURATOR_USER_IDS;
  });

  it("a curator's swept WORK fact is moderated like anyone else's, not published", async () => {
    process.env.TRUSTED_FACT_CURATOR_USER_IDS = '501';
    mockQuery.mockResolvedValue(rows([]) as never);
    mockModeration(false);

    const result = await submitContactFact('501', RAW_PHONE, 'role', 'CEO @ Somewhere', 'sweep');

    expect(result.is_public).toBe(false);
    // The verdict was asked for — the curator bypass did not skip it.
    expect(mockCreate).toHaveBeenCalled();
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

    expect(facts).toEqual([
      { field_type: 'city', value: 'Tbilisi', is_public: true, visibility: 'public' },
    ]);
  });

  it('names the state of every own row, so matchable is distinguishable from private', async () => {
    setup(
      [
        { field_type: 'role', value: 'CTO', is_public: true, is_matchable: true },
        { field_type: 'note', value: 'ეძებს ინვესტორს', is_public: false, is_matchable: true },
        { field_type: 'note', value: 'პირადი', is_public: false, is_matchable: false },
      ],
      [],
    );

    const { facts } = await getVisibleFacts(USER, RAW_PHONE);

    // is_public alone collapses the last two into one indistinguishable state.
    expect(facts.map((f) => f.visibility)).toEqual(['public', 'matchable', 'private']);
  });
});

// 5 September: the seed import put the same LinkedIn on 57 people twice, and a
// bare „CEO, ARCI" beside a full career line, because neither shape counted as
// a repeat.
describe('isNearDuplicateFact — the same statement written differently', () => {
  it('one link written two ways is one link', () => {
    expect(
      isNearDuplicateFact(
        'linkedin.com/in/beso-ortoidze-9064551a0',
        'https://www.linkedin.com/in/beso-ortoidze-9064551a0/',
      ),
    ).toBe(true);
  });

  it('two different profiles on the same site are still two links', () => {
    expect(
      isNearDuplicateFact(
        'https://www.linkedin.com/in/gurikoiava/',
        'https://www.linkedin.com/in/levan-lashkarava/',
      ),
    ).toBe(false);
  });

  it('a line whose every word is already on file adds nothing', () => {
    expect(
      isNearDuplicateFact(
        'CEO, ARCI',
        'CEO @ Arci (2020–present); rose from Finance Officer (2005) to CEO within the one company',
      ),
    ).toBe(true);
  });

  it('a longer line that says something new is not a repeat', () => {
    expect(
      isNearDuplicateFact('CEO @ Arci', 'CFO @ Bank of Georgia, then head of the retail board'),
    ).toBe(false);
  });

  it('a single shared word is a coincidence, not a restatement', () => {
    expect(
      isNearDuplicateFact('Arci', 'CEO @ Arci (2020–present); rose from Finance Officer'),
    ).toBe(false);
  });
});

/**
 * A fact the assistant did not hear from the owner may be USED, never SHOWN.
 *
 * 17 September, thread 16902. „Who is Maro Koshadze?" — a question, no goal,
 * nothing asked for. The run searched the name, read the profile, searched the
 * web twice, and wrote three facts onto a real person's record. Two stayed
 * private. The third, a headline lifted off a web page, was stored PUBLIC and
 * matchable: an unverified claim about a real person, published to the network
 * under the owner's name, without the owner being told.
 *
 * The rule was already written in the source — „what the assistant took from a
 * web page or inferred (confidence 'mentioned') never [goes public]" — and was
 * enforced on one branch only. The other asks the moderator, whose prompt
 * opens „A user saved this about one of their contacts". That is not true of a
 * web-sourced line and the model cannot know it; asked whether a job title is
 * professional or personal, it answers professional.
 *
 * Measured before clamping: of 48 facts ever written with confidence
 * 'mentioned', exactly one was public — that one.
 */
describe('a web-sourced fact stays on the owner’s own copy', () => {
  it('is neither public nor matchable, whatever the moderator would have said', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);
    mockModeration(true);

    const result = await submitContactFact(
      USER,
      RAW_PHONE,
      'headline',
      'Product Manager at Phubber; Visiting Lecturer at Caucasus University',
      'chat',
      'mentioned',
    );

    expect(result.is_public).toBe(false);
    const [, params] = insertCall();
    // is_public, then is_matchable. Matchable is what lets ANOTHER person's
    // search hit this row, which is publication by a quieter name.
    expect((params as unknown[])[4]).toBe(false);
    expect((params as unknown[])[5]).toBe(false);
    // …and the row is still written: „save it as info for Netai brain, so that
    // it knows it." The owner's own assistant reads it.
    expect((params as unknown[])[3]).toContain('Phubber');
  });

  it('never SHOWS the moderator a web line — it cannot judge what it is not told', async () => {
    // Its prompt opens „A user saved this about one of their contacts", which
    // is untrue here. The call also costs a model round trip to be told
    // something already decided.
    mockQuery.mockResolvedValue(rows([]) as never);

    await submitContactFact(USER, RAW_PHONE, 'note', 'Runs a logistics firm', 'chat', 'mentioned');

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('keeps it out of the crowd path too — a web page is not a second person', async () => {
    // A core fact with one other person's matching value would have published
    // both. Two independent people is what makes a core fact public, and a
    // page the assistant read is not the second one.
    mockQuery.mockResolvedValue(rows([{ id: 9, value: 'Amadeo' }]) as never);

    const result = await submitContactFact(
      USER,
      RAW_PHONE,
      'employer',
      'Amadeo',
      'chat',
      'mentioned',
    );

    expect(result).toEqual({ is_public: false, canonical_value: null });
    // Never even asked whether the values match.
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('does NOT touch what the owner actually said', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);
    mockModeration(true);

    const result = await submitContactFact(
      USER,
      RAW_PHONE,
      'note',
      'Fintech product manager',
      'chat',
      'stated',
    );

    expect(result.is_public).toBe(true);
  });

  it('does NOT touch a row whose confidence was never recorded', async () => {
    // null means „not recorded", most of it predates the column, and reading
    // it as a web guess would rewrite the meaning of 774 existing rows.
    mockQuery.mockResolvedValue(rows([]) as never);
    mockModeration(true);

    const result = await submitContactFact(
      USER,
      RAW_PHONE,
      'note',
      'Runs a logistics company',
      'chat',
      null,
    );

    expect(result.is_public).toBe(true);
  });
});

/**
 * ROW 252 — ONE PERSON'S CORE FACT MAKES ITS SUBJECT FINDABLE, NOT QUOTABLE.
 *
 * The founder, 22 September (D440): „fact is saved, Giorgi is foundable when
 * someone looks for architect, but only Netai sees that. it is not public
 * until 2 men confirm it. before that assistant just gives you his name when
 * you are looking for architect."
 *
 * Two switches, and this file only ever set one. A core fact from a single
 * member went in with `is_public` and `is_matchable` both at their defaults —
 * false — so „findable on one person's word" had no state it could be in.
 *
 * WHICH IS WHY THE ROW FAILED ONE RING OUT AND PASSED ONE RING IN. The seat
 * saved „wine importer" (occupation) and „wine import" (industry) on a contact
 * and could not find them from the second circle in nine tries. Both rows are
 * `is_public false, is_matchable false`, and every cross-account search filters
 * on „is_public OR is_matchable". The fact CTE built for this row was reading
 * rows that were not allowed to travel: 55 of them, on 48 people.
 */
describe('row 252 — a core fact from one member can be matched on', () => {
  /** The parameter positions of the upsert, which is a different call shape. */
  const IS_MATCHABLE = 6;

  function upsertCall(): [string, unknown[]] {
    const call = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('ON CONFLICT (neo4j_contact_id, submitted_by_user_id, field_type)'),
    );
    return [call?.[0] as string, call?.[1] as unknown[]];
  }

  it.each(['occupation', 'employer', 'city', 'industry'])(
    'a stated %s saved in chat is matchable from the first source',
    async (fieldType) => {
      mockQuery.mockResolvedValue(rows([]) as never);

      const result = await submitContactFact(USER, RAW_PHONE, fieldType, 'wine importer', 'chat');

      const [, params] = upsertCall();
      expect(params[IS_MATCHABLE]).toBe(true);
      // And NOT public: that still takes a second person.
      expect(result.is_public).toBe(false);
    },
  );

  /**
   * THE TWO EXCLUSIONS ARE THE FOUNDER'S OWN, already applied one function down
   * for publication. „is_matchable is what lets ANOTHER person's search hit
   * this row, which is publication by a quieter name" is written in this file
   * about the web case, and it still holds.
   */
  it('does not make a web reading matchable', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await submitContactFact(USER, RAW_PHONE, 'occupation', 'architect', 'chat', 'mentioned');

    expect(upsertCall()[1][IS_MATCHABLE]).toBe(false);
  });

  /**
   * AND A SWEEP-RECORDED „STATED" IS MATCHABLE, WHICH REVERSES THIS FILE'S OWN
   * FIRST VERSION.
   *
   * That version excluded the sweep, borrowing the curator rule's exclusion.
   * The seat disproved it within the hour: they saved „beekeeper" as an
   * occupation in chat, searched one ring out and found nobody, because the
   * SWEEP is how an occupation mentioned in a conversation is recorded —
   * 19 sweep/stated occupations against 8 chat/stated, over every core fact
   * with a recorded provenance. The borrowed exclusion is about PUBLISHING, and
   * being findable says nothing out loud.
   */
  it('makes a sweep-recorded statement matchable — it is still what the person said', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await submitContactFact(USER, RAW_PHONE, 'occupation', 'architect', 'sweep', 'stated');

    expect(upsertCall()[1][IS_MATCHABLE]).toBe(true);
  });

  /** „mentioned" from the sweep is still the assistant's own reading, and still out. */
  it('does not make a sweep GUESS matchable', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await submitContactFact(USER, RAW_PHONE, 'occupation', 'architect', 'sweep', 'mentioned');

    expect(upsertCall()[1][IS_MATCHABLE]).toBe(false);
  });

  /**
   * A NULL CONFIDENCE IS LEFT ALONE. It means „not recorded", most of it
   * predates the column, and 774 rows should not change meaning here.
   */
  it('leaves an unrecorded confidence where it was', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await submitContactFact(USER, RAW_PHONE, 'occupation', 'architect', 'chat', null);

    expect(upsertCall()[1][IS_MATCHABLE]).toBe(false);
  });

  /**
   * AND THE UPDATE RE-DECIDES IT RATHER THAN KEEPING IT. The value changed, so
   * an earlier row's matchability was about earlier words — the same reasoning
   * that already demotes `is_public` on that line.
   */
  it('re-decides matchability when the value is replaced', () => {
    const src = readFileSync(join(__dirname, '..', 'contactFacts.service.ts'), 'utf8');
    const at = src.indexOf('ON CONFLICT (neo4j_contact_id, submitted_by_user_id, field_type)');

    expect(src.slice(at, at + 400)).toContain('is_matchable = $7');
  });
});
