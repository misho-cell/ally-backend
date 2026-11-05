import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 3433 (QA-026): a helper's typed no was stored as an answer. #8779 b (rule 38,
 * the founder 4 Nov 19:07): whether the helper's words say „I can't help" is the
 * model's reading — send_answer_to_asker carries cannot_help — never a word list.
 */
describe('a typed no is a decline, as the model reads it', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

  it('the answer tool carries cannot_help to the store', () => {
    expect(chat).toContain('cannot_help: {');
    expect(chat).toContain("input['cannot_help'] === true,");
    expect(asks).toContain(
      'const captured = await recordAskAnswer(askThreadId, answerText, cannotHelp);',
    );
  });

  it('a decline is that reading or the decline button — no word list', () => {
    const fn = asks.slice(asks.indexOf('async function answerIsADecline('));
    expect(fn.slice(0, 400)).toContain(
      'return cannotHelp || (await askTapOnThread(askThreadId, answer)) === AskTap.Decline;',
    );
    expect(asks).not.toContain('isTypedDecline');
  });
});
