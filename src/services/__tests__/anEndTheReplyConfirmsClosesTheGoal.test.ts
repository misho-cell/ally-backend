import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #8779 group b, rule 31 (the founder, 4 Nov 19:07): the server no longer closes a
 * goal because the owner's line and the reply both held stop words; in the owner's
 * turn the model closes it with update_task.
 */
describe('#8779 (rule 31): no close from stop words in the reply', () => {
  it('has no server close that reads the reply’s words', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).not.toContain('closeWhatTheReplySaysItStopped');
    expect(chat).not.toContain('replySaysItStopped');
  });
});
