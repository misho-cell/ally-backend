import { readFileSync } from 'fs';
import { join } from 'path';
import {
  joinSystemPrompt,
  plainSystemPrompt,
  systemBlocks,
  VOLATILE_MARKER,
} from '../systemPromptParts';

/**
 * Account 172662, 30 Sep: every message re-wrote ~47,000 system-prompt tokens
 * to the cache and read only the 24,702 of the tools — the one cache
 * breakpoint sat after the per-minute clock, so it never matched twice.
 */
describe('the system prompt is cached up to its per-minute tail', () => {
  const stable = 'BASE RULES … NOTES … TASKS';
  const volatile = '## დღეს: ოთხშაბათი, 12:41';

  it('puts the breakpoint on the stable part and the clock after it', () => {
    const blocks = systemBlocks(joinSystemPrompt(stable, volatile));
    expect(blocks).toEqual([
      { type: 'text', text: stable, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: volatile },
    ]);
  });

  it('two runs a minute apart share the cached part exactly', () => {
    const first = systemBlocks(joinSystemPrompt(stable, '## 12:41'))[0];
    const second = systemBlocks(joinSystemPrompt(stable, '## 12:42'))[0];
    expect(second).toEqual(first);
  });

  it('sends one cached block when there is no tail', () => {
    expect(systemBlocks(joinSystemPrompt(stable, '  '))).toEqual([
      { type: 'text', text: stable, cache_control: { type: 'ephemeral' } },
    ]);
  });

  it('gives the other provider one plain text, with no marker in it', () => {
    const plain = plainSystemPrompt(joinSystemPrompt(stable, volatile));
    expect(plain).not.toContain(VOLATILE_MARKER.trim());
    expect(plain).toBe(`${stable}\n\n${volatile}`);
  });

  it('is what the run actually sends', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('system: systemBlocks(systemPrompt),');
    // GPT gets the markerless prompt; since row 290 its own blocks ride after it,
    // and since row 268 a non-Georgian run's language rule rides after those.
    expect(chat).toContain('plainSystemPrompt(systemPrompt) + gptBlocks + gptLanguageLast(');
    expect(chat).toContain('sameRequestAgain + agentPrompt.volatilePrompt,');
    // The clock is no longer part of the stable string.
    expect(chat).toContain('const volatilePrompt = buildTodaySection(new Date());');
  });
});
