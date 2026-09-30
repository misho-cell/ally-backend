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
    expect(SALVAGE).toContain('logSalvageFallback(ctx.runId, err instanceof Error');
  });

  it('logs an answer that came back with no text', () => {
    expect(SALVAGE).toMatch(/if \(!text\)\s+logSalvageFallback\(ctx.runId,/);
  });

  it('names the run in the line', () => {
    expect(CHAT).toContain('`[chat] run ${runId} salvage fell back to the fixed line: ${why}`');
  });
});
