/**
 * Ticket 19 G7 — the admin thread read shows what a run said, not what it did.
 *
 * Thread 15346, inside eight minutes: „the second circle is empty", then „the
 * second circle shows craftsmen Ketevan knows", then „both circles are empty".
 * Three step captions, three different claims, and no way to tell which was
 * true — because a step caption is written BEFORE the call. It says what the
 * run intends, and it was being read as a record of what happened.
 *
 * These tests are about the two things the record must not become: a second
 * copy of what people wrote to each other, and a place a full phone number
 * ends up (D149).
 */
jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import {
  logToolCall,
  outcomeOf,
  redactPhones,
  resultCountOf,
  summariseArgs,
} from '../toolCallLog.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('Ticket 19 G7 — summarising a tool call for the admin', () => {
  describe('phones (D149)', () => {
    it('keeps only the last four digits', () => {
      expect(redactPhones('995599123456')).toBe('…3456');
      expect(redactPhones('+995 599 12 34 56')).toBe('…3456');
    });

    it('redacts a phone wherever it appears in the line', () => {
      const out = summariseArgs({ phone: '995599123456', task_id: 2872 });
      expect(out).toContain('…3456');
      expect(out).not.toContain('995599123456');
      expect(out).toContain('task_id=2872');
    });

    it('leaves a short number that is not a phone alone', () => {
      expect(redactPhones('2872')).toBe('2872');
    });
  });

  describe('what is never written down', () => {
    it.each(['answer_text', 'question', 'message', 'brief', 'note', 'text'])(
      'records the length of %s and not its words',
      (key) => {
        const secret = 'ნინია გეკითხება, შეგიძლია შეხვდე ერეკლეს';
        const out = summariseArgs({ [key]: secret });
        expect(out).not.toContain('ნინია');
        expect(out).toBe(`${key}=<${secret.length} chars>`);
      },
    );

    it('still records the arguments that answer the question being asked', () => {
      expect(summariseArgs({ tag_query: 'ვეტერინარი' })).toBe('tag_query=ვეტერინარი');
    });
  });

  describe('one line, however large the argument', () => {
    it('truncates rather than storing a whole page', () => {
      const out = summariseArgs({ url: `https://example.com/${'x'.repeat(5000)}` });
      expect(out.length).toBeLessThanOrEqual(301);
      expect(out.endsWith('…')).toBe(true);
    });

    it('survives an argument that is not a string', () => {
      expect(summariseArgs({ ids: [1, 2, 3], ok: true, missing: null })).toBe(
        'ids=[1,2,3] ok=true missing=null',
      );
    });
  });

  describe('how much came back', () => {
    it("uses the tool's own count when it has one", () => {
      expect(resultCountOf({ count: 0, results: [] })).toBe(0);
      expect(resultCountOf({ count: 7 })).toBe(7);
    });

    it('falls back to the length of the first list, which is what a search returns', () => {
      expect(resultCountOf({ results: ['a', 'b'] })).toBe(2);
      expect(resultCountOf({ contacts: [] })).toBe(0);
    });

    it('says nothing rather than guessing when there is no count at all', () => {
      expect(resultCountOf({ sent: true })).toBeNull();
      expect(resultCountOf('ok')).toBeNull();
      expect(resultCountOf(null)).toBeNull();
    });

    it('distinguishes an empty result from a missing one — the 15346 question', () => {
      expect(resultCountOf({ count: 0 })).toBe(0);
      expect(resultCountOf({ count: 0 })).not.toBeNull();
    });
  });
});

/**
 * The second pass, written from the table's own first 33 rows — four minutes
 * after it went live, on a real goal thread of the founder's.
 *
 * Two things it got wrong about its own subject:
 *
 *   ask_contact × 8        chars 288, empty false. Reads as eight sends. They
 *                          were eight REFUSALS — exactly one ask row exists for
 *                          that goal. A refusal looked like a success.
 *
 *   search_second_degree   count NULL, empty false. Reads as "something came
 *   × 3                    back". search_activity says 0 for all three.
 *
 * The second is the tester's own G7 question — "did it search the second
 * circle, and what came back" — answered wrongly by the table built to answer
 * it. Both are one mistake: reading one field and assuming every tool uses it.
 */
describe('Ticket 19 G7, second pass — did it work, and did anything come back', () => {
  // The exact shape search_second_degree returns when it finds nobody.
  const NO_MATCHES = { found: false, reason: 'no_matches', search_id: 1234 };
  // The shape of a search that found people.
  const FOUND = { found: true, count: 24, results: new Array(24).fill({}) };

  it('an empty second-degree search is EMPTY, which it was not before', () => {
    expect(outcomeOf(NO_MATCHES).empty).toBe(true);
  });

  it('an empty second-degree search still WORKED — empty is not failed', () => {
    expect(outcomeOf(NO_MATCHES).ok).toBe(true);
  });

  it('a search that found people is neither empty nor failed', () => {
    expect(outcomeOf(FOUND)).toMatchObject({ ok: true, empty: false, count: 24 });
  });

  it('a refused ask is NOT ok, which is what the eight 288-char rows needed', () => {
    expect(outcomeOf({ sent: false, error: 'recipient is not on Netai' }).ok).toBe(false);
  });

  it('a sent ask is ok', () => {
    expect(outcomeOf({ sent: true, ask_id: 1816, to_name: 'ნინია' }).ok).toBe(true);
  });

  it.each([
    ['success', { success: false, error: 'x' }],
    ['updated', { updated: false }],
    ['saved', { saved: false }],
    ['deleted', { deleted: false }],
  ])('%s: false is a failure too', (_name, result) => {
    expect(outcomeOf(result).ok).toBe(false);
  });

  it('records the key NAMES, which is schema and not anyone’s words', () => {
    expect(outcomeOf(NO_MATCHES).keys).toBe('found,reason,search_id');
    expect(outcomeOf({ answer: 'ნინია ამბობს კი' }).keys).toBe('answer');
  });

  it('an empty list is empty even when the tool reports no count', () => {
    expect(outcomeOf({ results: [] }).empty).toBe(true);
    expect(outcomeOf({ results: [{}] }).empty).toBe(false);
  });

  it('survives a result that is not an object at all', () => {
    expect(outcomeOf('ok')).toMatchObject({ ok: true, empty: false, keys: null });
    expect(outcomeOf(null)).toMatchObject({ ok: true, empty: true });
    expect(outcomeOf('')).toMatchObject({ empty: true });
  });

  it('count 0 and count null stay different answers', () => {
    expect(outcomeOf({ count: 0 })).toMatchObject({ count: 0, empty: true });
    expect(outcomeOf({ sent: true })).toMatchObject({ count: null, empty: false });
  });
});

/**
 * Ticket 20 row 125 — the table knew there was an error and not what it said.
 *
 * 16 September, the tester's PR1 run: four of five propose_task_plan calls
 * failed on the first attempt (≈146 ms) and succeeded on the second (≈740 ms).
 * They asked what failed. This table — built for exactly that question — held
 * `ok = false` and `result_keys = 'error,proposed'`, and nothing more. The
 * argument the validator rejected was past args_summary's 300-character cut
 * too, so the answer was not recoverable from the record at all.
 *
 * The fix is one column. The lesson is the one this file already opens with:
 * a record that says something happened, without saying what, gets read as an
 * answer anyway.
 */
describe('row 125 — the reason, not just the fact', () => {
  it('keeps the error text of a failed call', () => {
    const out = outcomeOf({
      proposed: false,
      error: "person Eka: route must name one of the plan's routes",
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("person Eka: route must name one of the plan's routes");
  });

  it('is null for a call that worked, so the column reads as the reason', () => {
    expect(outcomeOf({ proposed: true, version: 2, summary: 'x' }).error).toBeNull();
    expect(outcomeOf('a plain string result').error).toBeNull();
    expect(outcomeOf(null).error).toBeNull();
  });

  it('redacts a phone inside an error, like every other text here (D149)', () => {
    const out = outcomeOf({ sent: false, error: 'No such contact: +995599123456' });
    expect(out.error).toBe('No such contact: …3456');
    expect(out.error).not.toContain('995599');
  });

  it('truncates a runaway error rather than letting one call fill the table', () => {
    const out = outcomeOf({ ok: false, error: 'x'.repeat(500) });
    expect(out.error).toHaveLength(301);
    expect(out.error?.endsWith('…')).toBe(true);
  });

  it('keeps only a string error — a shape we do not have is not guessed at', () => {
    expect(outcomeOf({ ok: false, error: { code: 17 } }).error).toBeNull();
    expect(outcomeOf({ ok: false, error: '   ' }).error).toBeNull();
    // Still a failure, though: `ok` reads the key's presence, not its type.
    expect(outcomeOf({ ok: false, error: { code: 17 } }).ok).toBe(false);
  });
});

/**
 * 22 September — the surface a call came from, and a thread that may not exist.
 *
 * The connector's calls could not be written at all: `thread_id` was NOT NULL
 * and a connector call has no conversation. Migration 166 makes the column
 * nullable and adds `surface`, and the two go together — a null thread is what
 * makes the row possible, and `surface` is what makes the counts either side
 * of today comparable, which a derived `thread_id IS NULL` would not.
 */
describe('where a call came from', () => {
  const written = (): { sql: string; params: unknown[] } => {
    const call = mockQuery.mock.calls[0];
    return { sql: String(call[0]), params: call[1] as unknown[] };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] } as never);
  });

  it('writes the surface beside the thread, for a chat call', async () => {
    await logToolCall({
      threadId: 21121,
      surface: 'chat',
      runId: 'r1',
      userId: '501',
      tool: 'search_by_tag',
      input: { tag: 'vet' },
      result: { found: true, count: 3 },
      durationMs: 42,
    });

    const { sql, params } = written();
    expect(sql).toContain('surface');
    expect(params[0]).toBe(21121);
    expect(params[1]).toBe('chat');
  });

  it('writes a connector call with no thread, which is what used to be impossible', async () => {
    await logToolCall({
      threadId: null,
      surface: 'connector',
      runId: null,
      userId: '501',
      tool: 'search_contacts',
      input: { tag: 'vet' },
      result: { found: true, count: 3 },
      durationMs: 42,
    });

    const { params } = written();
    expect(params[0]).toBeNull();
    expect(params[1]).toBe('connector');
  });

  it('redacts a connector call’s arguments exactly as a chat call’s (D149)', async () => {
    await logToolCall({
      threadId: null,
      surface: 'connector',
      runId: null,
      userId: '501',
      tool: 'get_contact_profile',
      input: { contact_ref: '995599123456', message: 'x'.repeat(40) },
      result: {},
      durationMs: 1,
    });

    const summary = String(written().params[5]);
    expect(summary).toContain('…3456');
    expect(summary).not.toContain('995599123456');
    // The free-text field is counted, never copied.
    expect(summary).toContain('message=<40 chars>');
  });
});
