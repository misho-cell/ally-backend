import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The tester's 1105 (33379): a plan turn's reply was blocked by moderation,
 * and the owner read the apology with no plan and no buttons. The server's
 * own plan text now stands in for a blocked plan reply.
 */
describe('a blocked plan reply', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const blockAt = chat.indexOf('const verdict = await moderateReply(cleanedFinal, userId);');
  const replyAt = chat.indexOf(
    'replySafe ? cleanedFinal : RUN_STRINGS[language].moderationBlocked',
  );

  it('tries the server plan text before the apology is chosen', () => {
    const fallbackAt = chat.indexOf('await planTextAfterBlock(runId, choices, userId)');
    expect(blockAt).toBeGreaterThan(-1);
    expect(fallbackAt).toBeGreaterThan(blockAt);
    expect(replyAt).toBeGreaterThan(fallbackAt);
  });

  it('uses only a plan asking for approval, and checks that text again', () => {
    const fn = chat.slice(chat.indexOf('async function planTextAfterBlock('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('if (!plan || !replyAsksForApproval(offered)) return null;');
    expect(body).toContain('(await moderateReply(text, userId)).safe ? text : null');
  });

  it('keeps the buttons once the plan text stands in', () => {
    const between = chat.slice(blockAt, replyAt);
    expect(between).toContain('cleanedFinal = planText;');
    expect(between).toContain('replySafe = true;');
  });
});
