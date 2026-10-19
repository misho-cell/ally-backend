import { readFileSync } from 'fs';
import { join } from 'path';
import { DELETING_TOOLS } from '../deletionClaim';

/** #4126 (68886, Misho's yes 19 Oct): „delete that fact about me" — in the chat. */
describe('#4126: a fact about oneself can be deleted from the chat', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('lists each fact with its id beside what Netai knows about them', () => {
    expect(chat).toContain('facts_about_me: facts,');
  });

  it('removes it the way the privacy page does, scoped to the caller’s own numbers', () => {
    expect(chat).toContain("case 'forget_fact_about_me': {");
    expect(chat).toContain('await removeFactAboutMe(Number(userId), id);');
    expect(chat).toContain(
      "{ deleted: false, error: 'No such fact about you — nothing was removed.' }",
    );
  });

  it('counts as a tool that deletes, so a reply may say it was deleted', () => {
    expect(DELETING_TOOLS.has('forget_fact_about_me')).toBe(true);
  });

  it('is offered to the app run', () => {
    expect(chat).toContain('  FORGET_FACT_ABOUT_ME_TOOL,');
  });
});
