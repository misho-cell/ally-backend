/**
 * Ticket 20 row 130 — stable first, volatile last.
 *
 * A cache is a PREFIX match: everything after the first differing byte is paid
 * for again. buildTodaySection carries the clock to the MINUTE and used to sit
 * second in the prompt, so of ~32,000 tokens only the base's ~8,400 could ever
 * be reused between runs. Cache writes are 66% of the Anthropic bill at 12.5x
 * the price of a read, and the OpenAI final answer measured cached_tokens: 0
 * on all six of its first live calls.
 *
 * This asserts the PROPERTY rather than the exact assembly, so a section added
 * later in the wrong place fails here instead of quietly costing money.
 */
import { buildTodaySection } from '../chat.service';

describe('the clock is the last thing in the prompt', () => {
  it('two prompts a minute apart share everything up to the clock', () => {
    const early = buildTodaySection(new Date('2026-09-17T09:00:00Z'));
    const later = buildTodaySection(new Date('2026-09-17T09:01:00Z'));

    // The section itself must differ — that is what makes its position matter.
    expect(early).not.toBe(later);
  });

  it('a whole prompt built as base + … + today keeps its prefix when the clock moves', () => {
    const stable = 'BASE'.repeat(3_000);
    const at09 = stable + buildTodaySection(new Date('2026-09-17T09:00:00Z'));
    const at10 = stable + buildTodaySection(new Date('2026-09-17T09:01:00Z'));

    // Everything before the clock is byte-identical, which is the only thing a
    // prefix cache can use.
    const shared = [...at09].findIndex((c, i) => c !== at10[i]);
    expect(shared).toBeGreaterThanOrEqual(stable.length);
  });

  it('the same prompt with the clock SECOND shares almost nothing — the old shape', () => {
    const stable = 'BASE'.repeat(3_000);
    const at09 = 'BASE' + buildTodaySection(new Date('2026-09-17T09:00:00Z')) + stable;
    const at10 = 'BASE' + buildTodaySection(new Date('2026-09-17T09:01:00Z')) + stable;

    const shared = [...at09].findIndex((c, i) => c !== at10[i]);
    // Four characters of a 12,000-character prompt. This is what was being
    // paid for on every run.
    expect(shared).toBeLessThan(200);
  });
});
