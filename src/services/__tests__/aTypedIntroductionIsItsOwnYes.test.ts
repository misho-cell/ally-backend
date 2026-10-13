import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * CF (2311's root cause; Misho's yes, 13 Oct, §139): request_introduction said
 * „Call only after the user explicitly confirms … only after they confirm", so a
 * typed „სთხოვე გიორგის, დამაკავშიროს ნინოსთან" was answered with a second
 * „shall I send it?" (conv 50823) or nothing. The typed line is the yes (D316).
 */
const CHAT = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
const TOOL = CHAT.slice(CHAT.indexOf("name: 'request_introduction',"));
const DESCRIPTION = TOOL.slice(0, TOOL.indexOf('input_schema'));

describe('a typed introduction is its own yes', () => {
  it('says so, word for word as approved', () => {
    expect(DESCRIPTION).toContain(
      "'Send an introduction request to a mutual contact (mediator). Call it once the user has said ' +\n" +
        "    'they want it: a typed instruction to introduce them („ask Gio to introduce me to Nino\") is ' +\n" +
        '    "itself that yes (D316) — send at once, without asking again.',
    );
  });

  it('no longer asks for a second confirmation', () => {
    expect(DESCRIPTION).not.toContain('explicitly confirms');
    expect(DESCRIPTION).not.toContain('only after they confirm');
  });
});
