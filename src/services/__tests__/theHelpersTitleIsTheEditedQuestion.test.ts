import { readFileSync } from 'fs';
import { join } from 'path';

/** T2477: the helper's conversation title carried the owner's raw first-person line (3 of 7). */
describe('theHelpersTitleIsTheEditedQuestion', () => {
  it('opens the helper’s thread after the editor, titled with the edited question', () => {
    const source = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    const edited = source.indexOf('const editorsAsk = await editOutgoingAsk(');
    const opened = source.indexOf(
      'liveThreadId ?? (await openAskThread(toUserId, senderName, edited.question, language));',
    );
    expect(edited).toBeGreaterThan(0);
    expect(opened).toBeGreaterThan(edited);
    expect(source).not.toContain('openAskThread(toUserId, senderName, safeQuestion, language)');
  });
});
