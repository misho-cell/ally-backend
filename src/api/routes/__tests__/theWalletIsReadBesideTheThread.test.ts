import { readFileSync } from 'fs';
import { join } from 'path';

/** The tester's 60624: a send took 1.8 s to be accepted with nobody else on the server. */
describe('accepting a message', () => {
  const routes = readFileSync(join(__dirname, '..', 'threads.routes.ts'), 'utf8');
  const send = routes.slice(routes.indexOf('console.log(\n        `[msg-in] user'));

  it("starts reading the owner's wallet before the thread is read", () => {
    const walletAt = send.indexOf(
      'const ownAllowance = checkRunAllowance(userId, subscriptionReadByGate(res));',
    );
    const threadAt = send.indexOf('const thread = await getThread(threadId, userId);');
    expect(walletAt).toBeGreaterThan(-1);
    expect(threadAt).toBeGreaterThan(walletAt);
    expect(send.slice(walletAt, threadAt)).toContain('ownAllowance.catch(() => undefined);');
  });

  it('uses it only when the owner pays, and reads the payer’s own wallet otherwise', () => {
    expect(send).toContain('? await ownAllowance');
    expect(send).toContain(': await checkRunAllowance(payerId);');
  });
});
