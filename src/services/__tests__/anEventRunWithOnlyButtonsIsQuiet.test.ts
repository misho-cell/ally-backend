import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The tester's 1145 (37893): the plan turn the server started after a goal was
 * saved wrote no words, only buttons, and the owner read „აირჩიე ერთ-ერთი:"
 * under the answer that already carried its own buttons.
 */
describe('a run started by an event that leaves only buttons', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('ends quietly instead of posting „pick one:"', () => {
    expect(chat).toContain('if (onlyButtons && userMessage.startsWith(RUN_EVENT_PREFIX)) {');
    const block = chat.slice(
      chat.indexOf('if (onlyButtons && userMessage.startsWith(RUN_EVENT_PREFIX)) {'),
    );
    expect(block.slice(0, 400)).toContain(
      "return { reply: '', language, requestCreated: false, runFailed: false, quiet: true };",
    );
  });

  it('keeps „pick one:" for a reply to the owner’s own words', () => {
    expect(chat).toContain('if (onlyButtons) effectiveFinal = RUN_STRINGS[language].choicesOnly;');
    const quiet = chat.indexOf('if (onlyButtons && userMessage.startsWith(RUN_EVENT_PREFIX)) {');
    const pickOne = chat.indexOf(
      'if (onlyButtons) effectiveFinal = RUN_STRINGS[language].choicesOnly;',
    );
    expect(quiet).toBeLessThan(pickOne);
  });
});
