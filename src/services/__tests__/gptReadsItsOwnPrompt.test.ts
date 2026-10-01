import { readFileSync } from 'fs';
import { join } from 'path';
import { gptLanguageLast } from '../chat.service';

/**
 * Row 290 — GPT writes the final Georgian text and had no prompt of its own.
 * Misho, 1 Oct: a GPT prompt, edited in the admin console the same way as
 * Claude's, with a selector for which model a block is for.
 */
describe('GPT reads its own prompt blocks', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('adds the run mode’s GPT blocks to what GPT is given', () => {
    expect(chat).toContain(
      "const gptBlocks = finalAnswerModel() === '' ? '' : await gptBlocksFor(runId, userId);",
    );
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

/**
 * Row 268's language half: an English run's GPT final came back Georgian, the
 * Georgian-voice block being the last thing GPT read.
 */
describe('GPT is told the reply language last', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('says it again after its own blocks on a non-Georgian run', () => {
    const line = gptLanguageLast('en');
    expect(line).toContain('Write your ENTIRE reply in English');
    expect(line).toContain('apply only to a Georgian reply');
  });

  it('adds nothing to a Georgian run', () => {
    expect(gptLanguageLast('ka')).toBe('');
  });

  it('is the last part of what GPT is given', () => {
    expect(chat).toContain(
      'plainSystemPrompt(systemPrompt) + gptBlocks + gptLanguageLast(runLang(runId)),',
    );
  });
});

/**
 * Row 313, the tester's 944: the run's stamp listed only Claude's blocks, so
 * the GPT block looked absent from runs that had in fact loaded it.
 */
describe("GPT's blocks are on the run's stamp", () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const blocks = readFileSync(join(__dirname, '..', 'promptBlocks.service.ts'), 'utf8');

  it('are appended to the same stamp, marked as GPT’s', () => {
    expect(blocks).toContain("export const GPT_STAMP_PREFIX = 'gpt:';");
    expect(blocks).toContain('SET block_names = block_names || $2::text[]');
  });

  it('are stamped where GPT loads them, without failing the run', () => {
    const loader = chat.slice(chat.indexOf('async function gptBlocksFor'));
    expect(loader.slice(0, 900)).toContain(
      'await stampGptBlocks(runId, composed.names, composed.versions).catch(',
    );
  });
});
