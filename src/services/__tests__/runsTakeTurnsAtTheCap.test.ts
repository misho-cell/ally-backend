import { readFileSync } from 'fs';
import { join } from 'path';

import { releaseRunSlot, RUN_SLOTS, runSlotState, takeRunSlot } from '../runSlots';

/** F4 of the tester's launch report (60358): a fixed number of runs work at once. */
describe('run slots', () => {
  afterEach(() => {
    while (runSlotState().inUse > 0) releaseRunSlot();
  });

  it('lets runs start at once up to the cap', async () => {
    await takeRunSlot('a', 2);
    await takeRunSlot('b', 2);
    expect(runSlotState()).toEqual({ inUse: 2, waiting: 0 });
  });

  it('makes the next one wait, and hands it the first slot freed, in arrival order', async () => {
    await takeRunSlot('a', 1);
    const started: string[] = [];
    const c = takeRunSlot('c', 1).then(() => started.push('c'));
    const d = takeRunSlot('d', 1).then(() => started.push('d'));
    await Promise.resolve();
    expect(started).toEqual([]);
    expect(runSlotState()).toEqual({ inUse: 1, waiting: 2 });

    releaseRunSlot();
    await c;
    expect(started).toEqual(['c']);
    releaseRunSlot();
    await d;
    expect(started).toEqual(['c', 'd']);
    expect(runSlotState()).toEqual({ inUse: 1, waiting: 0 });
  });

  it('caps at sixty', () => {
    expect(RUN_SLOTS).toBe(60);
  });
});

describe("an owner's run", () => {
  const routes = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'threads.routes.ts'),
    'utf8',
  );

  it('takes a slot before it starts, and gives it back however it ends', () => {
    expect(routes).toContain(
      'void takeRunSlot(run.runId).then(() => startOwnerRun(run).finally(releaseRunSlot));',
    );
  });

  it('starts its budget clock inside the slot', () => {
    const start = routes.slice(routes.indexOf('function startOwnerRun(run: OwnerRun)'));
    expect(start.indexOf("new Error('RUN_HARD_TIMEOUT')")).toBeGreaterThan(-1);
    expect(start.slice(0, start.indexOf('Promise.race(['))).toContain('return (');
  });
});
