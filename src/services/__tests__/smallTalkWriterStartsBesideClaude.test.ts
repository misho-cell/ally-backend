import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #958 (the tester's 44122, run c1d02ae8): a small-talk reply took 4.2 s after
 * the start — Claude answered in 2 s, its answer was set aside, and only then
 * did the writer spend another 2 s writing the reply the owner reads. Small
 * talk runs no tool, so the writer starts beside Claude, and Claude's answer
 * stays the fallback.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('the small-talk writer', () => {
  const early = chat.indexOf(
    "const earlyFinal = smallTalkOnly && writer !== '' ? writeWith(writer) : null;",
  );
  const firstCall = chat.indexOf('let response = await callClaude(');

  it('starts before the first Claude call, not after it', () => {
    expect(early).toBeGreaterThan(-1);
    expect(firstCall).toBeGreaterThan(early);
  });

  it('is the reply when it wrote one; otherwise the ordinary writer and then Claude answer', () => {
    expect(chat).toContain('let rewritten = await (earlyFinal ?? writeWith(writer));');
  });

  it('keeps Claude off the screen while it writes, so the two never mix', () => {
    expect(chat).toContain('const firstTurnText = earlyFinal === null ? stream : undefined;');
    const call = chat.slice(firstCall, chat.indexOf('});', firstCall));
    expect(call).toContain('onText: firstTurnText,');
  });

  it('reads its blocks once, however many times it writes', () => {
    expect(chat).toContain(
      'const gptBlocks = (): Promise<string> => (gptBlocksRead ??= gptBlocksFor(runId, userId));',
    );
  });
});
