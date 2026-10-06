import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The tester's 973: three replies stamped „gpt:gpt_georgian_voice@18:34:03Z"
 * were written by Claude — the final writer is off (no GPT reply in six days),
 * yet its blocks were loaded and stamped on every run. A stamp names only
 * what took part in the reply.
 */
describe('GPT’s blocks are stamped only when GPT writes', () => {
  it('are not read while the final writer is off', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      "const gptBlocks = writer === '' ? '' : await gptBlocksFor(runId, userId);",
    );
  });
});
