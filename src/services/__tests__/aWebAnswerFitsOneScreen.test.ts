import { readFileSync } from 'fs';
import { join } from 'path';

/** 2580 (WB-001): web answers of 722 / 983 / 1216 characters — the limit ran on one road only. */
describe('aWebAnswerFitsOneScreen', () => {
  it('shortens a long web answer whoever wrote it, never a list answer', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const at = chat.indexOf(
      'runWebFound.has(runId) &&\n    (runListLabels.get(runId) ?? []).length === 0 &&',
    );
    expect(at).toBeGreaterThan(0);
    expect(chat.slice(at, at + 400)).toContain(
      'await shortenedDraft(finalText, userId, runId, threadId)',
    );
  });
});
