import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The tester's 1152 (38551, 38585): a server-started run worked, showed
 * „searching the web…", ended with nothing to say, and that caption stayed the
 * conversation's last line under a conversation marked done.
 */
describe('a run that ends quietly', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('takes back its own captions and steps, and tells the client', () => {
    const fn = chat.slice(chat.indexOf('async function dropQuietRunTrail('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain("WHERE thread_id = $1 AND run_id = $2 AND kind IN ('caption', 'step')");
    expect(body).toContain('RETURNING id, content');
    expect(body).toContain('emitStepRetracted(userId, threadId, runId, row.content)');
  });

  /** #1750 (tester 40921): the third — the go-between's close line said it all. */
  it('does so on all three quiet endings', () => {
    expect(chat.split('await dropQuietRunTrail(userId, threadId, runId);').length - 1).toBe(3);
  });
});
