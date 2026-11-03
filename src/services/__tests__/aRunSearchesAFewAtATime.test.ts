import { readFileSync } from 'fs';
import { join } from 'path';
import { enterSearchGate, MAX_PARALLEL_SEARCHES_PER_RUN } from '../searchGate';

/** #8619 retest 3 (81742): 16 searches at once ran 11–26 s each; a few at a time. */
describe('a run searches the network a few at a time', () => {
  it('lets the first ones in and holds the rest until one leaves', async () => {
    const key = 'gate-run';
    const leaves = await Promise.all(
      Array.from({ length: MAX_PARALLEL_SEARCHES_PER_RUN }, () => enterSearchGate(key)),
    );
    let entered = false;
    const waiting = enterSearchGate(key).then((leave) => {
      entered = true;
      return leave;
    });
    await Promise.resolve();
    expect(entered).toBe(false);
    leaves[0]();
    const leave = await waiting;
    expect(entered).toBe(true);
    leave();
    leaves.slice(1).forEach((l) => l());
  });

  it('gives a place back only once', async () => {
    const leave = await enterSearchGate('gate-once');
    leave();
    leave();
    const again = await enterSearchGate('gate-once');
    again();
  });

  it('wraps every network search in the chat, released even when it throws', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('? await enterSearchGate(runId)');
    expect(chat).toMatch(/\} finally \{\s+leaveGate\(\);\s+\}/u);
  });
});
