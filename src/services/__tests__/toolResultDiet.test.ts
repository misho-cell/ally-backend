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

  it('leaves small results untouched', () => {
    const input = { found: true, count: 3, results: [{ a: 1 }, { a: 2 }, { a: 3 }] };

    expect(dietToolResult(input)).toBe(input);
  });

  it('leaves non-object and results-less shapes untouched', () => {
    expect(dietToolResult(null)).toBeNull();
    expect(dietToolResult('text')).toBe('text');
    const noResults = { found: false, reason: 'no_matches' };
    expect(dietToolResult(noResults)).toBe(noResults);
  });
});
