import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Tester 1080/1081. 32183: the model closed a duplicate goal with tools and
 * wrote no sentence, and the owner's turn failed. 32204/32206: the first
 * answer and its re-ask both came back blank, and the turn failed. An owner's
 * turn in either state now gets the text-only salvage a crashed call already
 * gets, while a turn that offers buttons, and every system-started turn, keep
 * their own paths.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
const hook = chat.slice(chat.indexOf("finalText.trim() === '' &&\n    !ownerAbsent"));

describe('an owner turn that did work never ends without a word', () => {
  it('salvages a text line after tools ran or a twice-blank answer', () => {
    expect(hook.slice(0, 400)).toContain('(toolCallCount > 0 || blankAfterRetry)');
    expect(hook.slice(0, 900)).toContain('await salvageFinalAnswer(');
  });

  it('leaves system-started turns and button answers to their own paths', () => {
    expect(hook.slice(0, 400)).toContain('!ownerAbsent');
    expect(hook.slice(0, 400)).toContain('choices === undefined');
    expect(hook.slice(0, 400)).toContain('options === undefined');
  });

  it('knows a twice-blank answer from the re-ask itself', () => {
    const retry = chat.indexOf('systemPrompt + BLANK_RETRY_NOTE');
    const flag = chat.indexOf('const blankAfterRetry = isBlankResponse(response);');
    expect(flag).toBeGreaterThan(retry);
  });
});
