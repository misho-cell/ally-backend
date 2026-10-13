import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 3070 (a) (the tester's 56299, trio 1; Misho's yes, §139): in the approval turn
 * the model called ask_contact twice and was refused twice („day one is already
 * starting"), which cost the turn a second round — 37.6 s before day one could
 * begin. A turn that approved the plan is not given ask_contact at all.
 */
const CHAT = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('the turn that approved the plan', () => {
  it('runs without ask_contact', () => {
    expect(CHAT).toContain(
      "runApprovedAPlan.has(runId) ? runTools.filter((tool) => tool.name !== 'ask_contact') : runTools,",
    );
  });

  it('decides that after the tap was acted on, so the approval is already known', () => {
    const tap = CHAT.indexOf('const approvedByTap = ownerAbsent');
    const loop = CHAT.indexOf('runApprovedAPlan.has(runId) ? runTools.filter(');
    expect(tap).toBeGreaterThan(-1);
    expect(loop).toBeGreaterThan(tap);
  });
});
