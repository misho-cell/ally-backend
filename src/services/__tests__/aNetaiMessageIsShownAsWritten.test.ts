/**
 * #7360 (box 73757): the founder's text „ტესტი — ნეტაი ვარ" was shown as
 * „ტესტი, ნეტაი ვარ" — the display rules for the model's prose rewrote it.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { shownAsWritten } from '../threads.service';

describe('a line the team wrote in the „Netai" conversation is shown as written', () => {
  it('skips the display rules for a team line (no run) in a Netai thread', () => {
    expect(shownAsWritten({ role: 'assistant', run_id: null }, true)).toBe(true);
  });

  it('keeps them for the model’s lines, other threads, and the reader’s own lines', () => {
    expect(shownAsWritten({ role: 'assistant', run_id: 'run-1' }, true)).toBe(false);
    expect(shownAsWritten({ role: 'assistant', run_id: null }, false)).toBe(false);
    expect(shownAsWritten({ role: 'user', run_id: null }, true)).toBe(false);
  });

  it('is applied where the thread’s messages are read', () => {
    const code = readFileSync(join(__dirname, '..', 'threads.service.ts'), 'utf8');
    expect(code).toContain('const teamWrites = await isNetaiThread(threadId);');
    expect(code).toMatch(/shownAsWritten\(row, teamWrites\)\s*\?\s*row\.content/u);
  });
});
