import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Tornike's 8 Nov report, #6: Beso only had to answer one question, and was
 * told which of his closest people hold the person close, by name. Colours and
 * bubbles serve the owner's own search; a helper's run gets results without
 * them.
 */
const CHAT = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('a helper’s search results', () => {
  it('go through the one hook that decides', () => {
    expect(CHAT).toContain(
      'const rawResult = await coloursForThisRun(userId, block.name, executed, runId);',
    );
  });

  it('carry no colours or bubble in an incoming ask, and do everywhere else', () => {
    const hook = CHAT.slice(CHAT.indexOf('async function coloursForThisRun('));
    const body = hook.slice(0, hook.indexOf('\n}\n'));
    expect(body).toContain(
      "if (runId !== undefined && runModes.get(runId) === 'incoming_ask') return executed;",
    );
    expect(body).toContain('return withOldAllyColours(userId, toolName, executed);');
  });
});
