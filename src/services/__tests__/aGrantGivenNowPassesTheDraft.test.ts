import { readFileSync } from 'fs';
import { join } from 'path';

const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

/**
 * #8615 (76858, 2 and 4 Nov): approve_task_plan sent the run to
 * grant_task_permission, the grant went through, and ask_contact still refused
 * „the plan is not approved" — four and five times in a row.
 */
describe('#8615: a grant given in this run passes the unapproved draft', () => {
  it('notes the goal when the grant tool or the owner’s instruction grants it', () => {
    expect(chat).toMatch(
      /const granted = await grantTaskPermission\(userId, input\['task_id'\] as number\);\s+if \(granted\) noteGrantedInRun\(runId, Number\(input\['task_id'\]\)\);/,
    );
    expect(chat).toMatch(
      /if \(await grantTaskPermission\(userId, Number\(task\.id\)\)\)\s*noteGrantedInRun\(runId, Number\(task\.id\)\);/,
    );
  });

  it('passes the note to the ask, only in the owner’s own turn, and forgets it with the run', () => {
    expect(chat).toContain(
      '!ownerAbsent && runId !== undefined && runGrantedTheGoal.get(runId)?.has(taskId) === true,',
    );
    expect(chat).toContain('runGrantedTheGoal.delete(runId);');
  });

  it('lets the ask past the draft only on that note — an older grant still waits (Task 99)', () => {
    expect(asks).toMatch(
      /const grantedNow =\s+draftIsWaiting && !introAccepted && !ownerNamedThem && grantedInThisRun === true;/,
    );
    expect(asks).toContain(
      'if (!introAccepted && !ownerNamedThem && !grantedNow && draftIsWaiting) {',
    );
    expect(asks).not.toMatch(/const grantedNow =[^;]*permission_granted/);
  });
});
