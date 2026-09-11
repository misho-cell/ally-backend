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
