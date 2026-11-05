import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Board #501 (Ninia, 2 Oct): „ვის შევთავაზო Netai?" from the goal box opened a
 * goal, ran the opening searches and wrote invite text nobody had asked for.
 * (#8779 group 4: the question words that kept it from being a goal are gone;
 * invite_contact's own description still asks for names first.)
 */
describe('whom to offer Netai to', () => {
  it('tells invite_contact to give names first and text only when asked', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const tool = chat.slice(chat.indexOf("name: 'invite_contact'")).slice(0, 2000);
    expect(tool).toContain('asks for NAMES, not texts');
    expect(tool).toContain('call this only once the user picks one or asks for the text');
  });
});
