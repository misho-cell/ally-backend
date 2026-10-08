import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 3400 (MASTER TEST RUN, 3 of 3): a new goal's first run called invite_contact
 * on its own; the gate refused it and the run apologised. An owner's run whose
 * line neither asks for an invitation nor approves one does not hold the tool.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('invite_contact before the owner says yes', () => {
  it('is not in the run’s tools unless the line asks for or approves an invitation', () => {
    const flat = chat.replace(/\s+/g, ' ');
    expect(flat).toContain(
      'const inviteHeld = ownerAbsent || asksForAnInvite(userMessage) || isApproveChoice(userMessage.trim());',
    );
    expect(chat).toContain(': tools.filter((tool) => tool.name !== INVITE_CONTACT_TOOL.name);');
  });

  it('the gate inside the tool stays as the second door', () => {
    expect(chat).toContain('return { invited: false, error: INVITE_NOT_ASKED };');
  });
});
