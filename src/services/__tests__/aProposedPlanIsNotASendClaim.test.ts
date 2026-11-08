import { readFileSync } from 'fs';
import { join } from 'path';
import { onlyProposedAPlan } from '../chat.service';

/**
 * Tester's report 8 Nov, C6: the run proposed a plan and ended „…დავიწყო
 * გელასთან საუბარი?"; the send-claim check read „I'll find out from Gela's
 * assistant" as a send and forced a rewrite that ended with the banned „დავიწყო?".
 */
describe('a run that only proposed a plan', () => {
  it('is told apart from one that approved or sent', () => {
    expect(onlyProposedAPlan(['search_by_tag', 'propose_task_plan'])).toBe(true);
    expect(onlyProposedAPlan(['propose_task_plan', 'approve_task_plan'])).toBe(false);
    expect(onlyProposedAPlan(['ask_contact'])).toBe(false);
  });

  it('is not forced into the „nothing was sent" rewrite', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const guard = chat.slice(chat.indexOf('const claimedAnAskNobodyGot ='));
    expect(guard.slice(0, 1200)).toContain('!onlyProposedAPlan(toolNamesUsed) &&');
  });
});
