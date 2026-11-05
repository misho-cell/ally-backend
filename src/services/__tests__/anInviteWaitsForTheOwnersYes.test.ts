import { readFileSync } from 'fs';
import { join } from 'path';
import { INVITE_ON_THE_OWNERS_WORD } from '../replyGuards';

/**
 * 3400 (MASTER TEST RUN, 3 of 3) and the tester's 47027: invite_contact and
 * get_invite_link went before the owner's yes. #8779 group 4 (the founder,
 * 4 Nov): the owner's word is the model's reading — the rule is in both tools'
 * descriptions, and no word list holds them back.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('an invitation waits for the owner’s word', () => {
  it('is said in both invite tools', () => {
    expect(INVITE_ON_THE_OWNERS_WORD).toContain('Only on the owner’s word');
    for (const name of ['invite_contact', 'get_invite_link']) {
      const tool = chat.slice(chat.indexOf(`name: '${name}',`));
      expect(tool.slice(0, 2500)).toContain('INVITE_ON_THE_OWNERS_WORD');
    }
  });

  it('is no longer a word gate in the run or inside the tool', () => {
    expect(chat).not.toContain('asksForAnInvite');
    expect(chat).not.toContain('asksForTheLink');
    expect(chat).not.toContain('INVITE_NOT_ASKED');
    expect(chat).not.toContain('inviteHeld');
  });
});
