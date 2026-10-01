import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Row 290 — GPT writes the final Georgian text and had no prompt of its own.
 * Misho, 1 Oct: a GPT prompt, edited in the admin console the same way as
 * Claude's, with a selector for which model a block is for.
 */
describe('GPT reads its own prompt blocks', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('adds the run mode’s GPT blocks to what GPT is given', () => {
    expect(chat).toContain('const gptBlocks = await gptBlocksFor(runId, userId);');
    expect(chat).toContain('plainSystemPrompt(systemPrompt) + gptBlocks');
  });

  it('loads them for the same mode the run resolved to, and forgets it with the run', () => {
    expect(chat).toContain('runModes.set(runId, agentPrompt.runMode);');
    expect(chat).toContain('composeBlocksForMode(mode, userId, PromptModel.Gpt)');
    expect(chat).toContain('runModes.delete(runId);');
  });

  it('lets the admin console create and list GPT blocks', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(routes).toContain('.isIn(Object.values(PromptModel))');
    expect(routes).toContain('gpt_mode_totals: computeModeTotals(blocks, PromptModel.Gpt)');
  });
});
