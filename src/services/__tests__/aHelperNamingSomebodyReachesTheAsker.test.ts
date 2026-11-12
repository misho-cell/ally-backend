import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #8944 (battery 5 Nov): a helper's „კი, X, შემიძლია დაგაკავშირო" got the server's
 * „ვკითხო X-ს?" card in place of reaching the asker. No card is offered now, and
 * such a line keeps relay_ask. (Moved from referralRecommendation.test.ts when
 * #8779 group 4 removed the recommendation word list.)
 *
 * Lika's book-fair test (12 Nov): this file once checked only that a line of
 * code was present, and that line held relay_ask in EVERY ask chat — the helper's
 * „yes, ask her" was refused twice and reached nobody. It now checks the effect.
 */
describe('#8944: a helper’s answer that names somebody', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('is never replaced by a server card', () => {
    expect(chat).not.toContain('offerReferral');
  });

  it('keeps relay_ask in an ask chat: the only tool a turn holds is create_task', () => {
    const at = chat.indexOf('const heldThisTurn = new Set(');
    const block = chat.slice(at, chat.indexOf('if (heldThisTurn.size > 0)', at));
    expect(block).toContain('createTaskHeld && tool.name === CREATE_TASK_TOOL_NAME');
    expect(block).not.toContain('RELAY_ASK_TOOL');
    expect(chat).not.toContain('const relayHeld');
  });
});
