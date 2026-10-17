import { readFileSync } from 'fs';
import { join } from 'path';

/** #5282 (Lika, 17 Oct): a plain chat had role NULL, so the app drew no „მოგვარდა". */
describe('the owner’s role in a plain chat', () => {
  const source = readFileSync(join(__dirname, '..', 'threads.service.ts'), 'utf8');
  const at = source.indexOf('const THREAD_ROLE_SQL');
  const role = source.slice(at, source.indexOf('END`;', at));

  it('is initiator, like a chat with a goal', () => {
    expect(role).toContain("WHEN t.type IN ('outgoing_request', 'regular') OR goal.id IS NOT NULL");
  });

  it('stays mediator or addressee where someone else asked', () => {
    expect(role.indexOf("t.type = 'incoming_request'")).toBeLessThan(role.indexOf("'regular'"));
    expect(role.indexOf("t.type = 'incoming_ask'")).toBeLessThan(role.indexOf("'regular'"));
  });
});
