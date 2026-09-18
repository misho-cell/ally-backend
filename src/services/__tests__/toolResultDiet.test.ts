import { dietToolResult } from '../toolResultDiet';

describe('dietToolResult', () => {
  it('slices oversized results and keeps the original count', () => {
    const results = Array.from({ length: 20 }, (_, i) => ({ phone: `+9955${i}` }));
    const dieted = dietToolResult({ found: true, count: 20, results }) as Record<string, unknown>;

    expect((dieted.results as unknown[]).length).toBe(8);
    expect(dieted.count).toBe(20);
    expect(dieted.results_shown).toBe(8);
    expect(dieted.note).toContain('20');
  });

  it('leaves small results as they are', () => {
    const input = { found: true, count: 3, results: [{ a: 1 }, { a: 2 }, { a: 3 }] };

    expect(dietToolResult(input)).toEqual(input);
  });

  it('leaves non-object and results-less shapes as they are', () => {
    expect(dietToolResult(null)).toBeNull();
    expect(dietToolResult('text')).toBe('text');
    const noResults = { found: false, reason: 'no_matches' };
    expect(dietToolResult(noResults)).toEqual(noResults);
  });

  it('drops the empty fields the model would quote as a blank (Ticket 16 Task 47)', () => {
    const input = {
      found: true,
      results: [
        { name: 'Ilia Tsulaia', employer: '', jobPosition: null, tags: [], city: 'Tbilisi' },
      ],
    };

    expect(dietToolResult(input)).toEqual({
      found: true,
      results: [{ name: 'Ilia Tsulaia', city: 'Tbilisi' }],
    });
  });

  it('keeps false and 0 — they are answers, not blanks', () => {
    const input = { found: false, count: 0, is_member: false, results: [{ warmth: 0 }] };

    expect(dietToolResult(input)).toEqual(input);
  });
});

/**
 * Row 141 — the dates were there and the model could not see one of them.
 *
 * The seat asked the founder's assistant, in plain English, „which goals do I
 * have open and when was each last active", and got „last activity is not
 * recorded" six times out of six. The admin read of the same six goals, the
 * same minute, had created_at and last_activity_at populated on every one.
 *
 * getMyTasks had always selected both. They arrived here as Date objects, this
 * function recursed into them, Object.entries(date) is empty, and the model was
 * handed `created_at: {}`. It said „not recorded" because that is what it
 * received. Not one tool — every tool result carrying a date, because this
 * function deliberately applies to all of them.
 */
describe('a date in a tool result', () => {
  const survives = (value: unknown): unknown =>
    (dietToolResult({ tasks: [{ id: 1, when: value }] }) as { tasks: { when: unknown }[] }).tasks[0]
      .when;

  it('is still a date, not the empty object it used to become', () => {
    const when = new Date('2026-09-17T20:43:00Z');

    expect(survives(when)).toBeInstanceOf(Date);
    expect(survives(when)).toEqual(when);
  });

  it('reaches the model as a readable timestamp', () => {
    // JSON.stringify renders a Date as an ISO string on its own — which is why
    // leaving it alone is the whole fix, and why `{}` was the whole bug.
    const json = JSON.stringify(dietToolResult({ at: new Date('2026-09-17T20:43:00Z') }));

    expect(json).toContain('2026-09-17T20:43:00.000Z');
    expect(json).not.toContain('{}');
  });

  it('survives inside an array of rows, which is how goals arrive', () => {
    const rows = dietToolResult({
      tasks: [
        { id: 1, last_activity_at: new Date('2026-09-17T20:43:00Z') },
        { id: 2, last_activity_at: new Date('2026-09-18T12:35:00Z') },
      ],
    }) as { tasks: { last_activity_at: unknown }[] };

    expect(rows.tasks.map((t) => t.last_activity_at)).toEqual([
      new Date('2026-09-17T20:43:00Z'),
      new Date('2026-09-18T12:35:00Z'),
    ]);
  });

  it('still drops the blanks it was written to drop', () => {
    // The Date guard must not become an excuse to keep everything.
    const out = dietToolResult({ a: new Date(0), b: '', c: null, d: [] }) as Record<
      string,
      unknown
    >;

    expect(Object.keys(out)).toEqual(['a']);
  });
});
