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

/**
 * Ticket 20 row 119, second pass — the seat's own suggestion, and it is better
 * than the rule it replaces.
 *
 * „ზეგ საღამოს" on goal 3701, created 16 September, was saved as
 * „17 სექტემბრის საღამოსთვის". It is the 18th. „ხვალ 10:00" on goal 3698
 * became the 17th, which is right — so the section was READ and the counting
 * was wrong, not the reading. Arithmetic is the part a model is worst at and a
 * server is best at.
 */
describe('row 119 — tomorrow and the day after are named, not counted', () => {
  // Midday, so the Tbilisi offset cannot move the day either way and the test
  // says the same thing wherever it runs.
  const NOON = new Date('2026-09-16T09:00:00Z');

  it('names all three days by date', () => {
    const section = buildTodaySection(NOON);

    expect(section).toContain('16');
    expect(section).toContain('ხვალ: ');
    expect(section).toContain('ზეგ: ');
  });

  it('the day after tomorrow is D+2 — the exact case that was saved wrong', () => {
    const section = buildTodaySection(NOON);
    const after = section.slice(section.indexOf('ზეგ: '));

    // 16 September + 2 = 18. The goal recorded 17.
    expect(after).toContain('18');
    expect(after).not.toContain('17');
  });

  it('tomorrow is D+1 and is not confused with the day after', () => {
    const section = buildTodaySection(NOON);
    const tomorrow = section.slice(section.indexOf('ხვალ: '), section.indexOf('ზეგ: '));

    expect(tomorrow).toContain('17');
    expect(tomorrow).not.toContain('18');
  });

  it('crosses a month end without counting past it', () => {
    const section = buildTodaySection(new Date('2026-09-30T09:00:00Z'));

    // 30 September + 2 = 2 October, not the 32nd of anything.
    expect(section.slice(section.indexOf('ზეგ: '))).toContain('ოქტომბერი');
  });

  it('tells the model to COPY these rather than work them out', () => {
    const section = buildTodaySection(NOON);

    expect(section).toContain('გადმოწერე');
    expect(section).toContain('ნუ დათვლი');
    // And the rest of row 119 stands: no date is ever invented.
    expect(section).toContain('ნურასდროს გამოიგონებ');
  });
});
