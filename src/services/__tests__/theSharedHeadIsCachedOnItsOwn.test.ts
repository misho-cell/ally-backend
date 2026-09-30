import { readFileSync } from 'fs';
import { join } from 'path';
import {
  GLOBAL_MARKER,
  joinStablePrompt,
  joinSystemPrompt,
  plainSystemPrompt,
  systemBlocks,
  VOLATILE_MARKER,
} from '../systemPromptParts';

/**
 * Measured 30 Sep afternoon: after the clock split, a run's first call still
 * read only the tools (25,296 tokens) and wrote 22–66k. The per-account part
 * changes between runs, and one breakpoint at its end threw away the global
 * head in front of it. The head now carries its own breakpoint.
 */
describe('the shared head of the system prompt is cached on its own', () => {
  const head = 'BASE RULES + INJECTION DEFENCE + MODE BLOCKS';
  const perAccount = 'NAME … NOTES … TASKS';
  const clock = '## დღეს: ოთხშაბათი, 13:20';

  it('sends three system blocks: head and account part cached, the clock after them', () => {
    const blocks = systemBlocks(joinSystemPrompt(joinStablePrompt(head, perAccount), clock));
    expect(blocks).toEqual([
      { type: 'text', text: head, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: perAccount, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: clock },
    ]);
  });

  it('keeps both breakpoints when there is no clock', () => {
    const blocks = systemBlocks(joinSystemPrompt(joinStablePrompt(head, perAccount), ''));
    expect(blocks.filter((b) => b.cache_control !== undefined)).toHaveLength(2);
  });

  it('never lets a marker reach a model as text', () => {
    const plain = plainSystemPrompt(joinSystemPrompt(joinStablePrompt(head, perAccount), clock));
    expect(plain).not.toContain(GLOBAL_MARKER.trim());
    expect(plain).not.toContain(VOLATILE_MARKER.trim());
    for (const block of systemBlocks(joinSystemPrompt(joinStablePrompt(head, perAccount), clock))) {
      expect(block.text).not.toContain('<<<');
    }
  });

  it('is the shape the run builds: the global head first, the account after', () => {
    const CHAT = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(CHAT).toMatch(
      /joinStablePrompt\(\s*\/\/[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*base \+ INJECTION_DEFENSE_PROMPT \+ modeBlocks\.text,/,
    );
  });
});
