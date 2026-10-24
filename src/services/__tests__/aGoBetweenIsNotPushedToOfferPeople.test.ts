import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #7327 (Lia's case, Iro's side 64089): the server's members note fired in a
 * go-between's chat and pushed a second, reversed question at someone who had
 * already answered. It is for the reader's own goals only.
 */
describe('the members notes in a go-between’s chat', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('never fire where the reader answers someone else’s question or introduction', () => {
    expect(chat).toContain(
      "const GO_BETWEEN_MODES: ReadonlySet<string> = new Set(['incoming_ask', 'request_thread']);",
    );
    expect(chat).toContain(
      "const readersOwnRequest = !GO_BETWEEN_MODES.has(runModes.get(runId) ?? '');",
    );
  });

  it('gate both the members-found note and the phonebook-members note', () => {
    expect(chat).toMatch(/const membersSkipped =\s+readersOwnRequest &&/);
    expect(chat).toMatch(/const bookMembersSkipped =\s+readersOwnRequest &&/);
  });
});
