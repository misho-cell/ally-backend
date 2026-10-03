import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Row 324, the seat's 875: run ad4ae736 ended in the fixed „ძიება ტექნიკური
 * შეფერხების გამო შეწყდა" line and the log said why the FIRST call died (the
 * stall watchdog) but not why the salvage call gave up — its catch was empty.
 *
 * Source-level, like `aThrownToolDoesNotEndTheRun`: the salvage lives inside
 * the run loop with no seam to call.
 */
const CHAT = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
const SALVAGE = CHAT.slice(
  CHAT.indexOf('async function salvageFinalAnswer('),
  CHAT.indexOf('function logSalvageFallback('),
);

describe('the fixed line is explained in the log', () => {
  it('has no empty catch left in the salvage', () => {
    expect(SALVAGE).not.toMatch(/catch\s*\{/);
    expect(SALVAGE).toContain('logSalvageStep(ctx.runId, `Claude failed: ${err instanceof Error');
  });

  it('logs an answer that came back with no text', () => {
    expect(SALVAGE).toMatch(/if \(!text\) logSalvageStep\(ctx.runId,/);
  });

  it('logs the fixed line itself when neither model wrote', () => {
    expect(SALVAGE).toContain("logSalvageFallback(ctx.runId, 'neither model wrote an answer');");
  });

  it('names the run in the line', () => {
    expect(CHAT).toContain('`[chat] run ${runId} salvage fell back to the fixed line: ${why}`');
  });
});

/**
 * The tester's 1119 (thread 34972, run 0d3df4f1): Claude was overloaded, its
 * salvage wrote no text, and the fixed line went out in front of a fresh plan.
 */
describe('the salvage asks GPT before the fixed line', () => {
  it('tries Claude, then GPT, then the fixed line, in that order', () => {
    const claude = SALVAGE.indexOf('await salvageByClaude(');
    const gpt = SALVAGE.indexOf('await salvageByGpt(');
    const fixed = SALVAGE.indexOf('return { text: SALVAGE_FALLBACK_REPLY');
    expect(claude).toBeGreaterThan(-1);
    expect(gpt).toBeGreaterThan(claude);
    expect(fixed).toBeGreaterThan(gpt);
  });

  it('stamps a GPT-written salvage as GPT’s', () => {
    expect(CHAT).toContain('if (salvaged.writtenBy !== null) answeredBy = salvaged.writtenBy;');
  });
});
