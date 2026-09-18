jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { frameServerTurn, INJECTION_DEFENSE_PROMPT } from '../chat.service';

/**
 * The seat's 5293, and it is the right diagnosis: „the server's own messages are
 * not marked as the server's."
 *
 * An engine wake is stored with role „user", so to the model it is the OWNER
 * speaking. One missing distinction, two faults chased all day:
 *
 *   LANGUAGE   the last thing the „user" said was 514 characters of Georgian
 *              that we wrote, and every instruction says to answer in the
 *              language the user used. It was not leaking, it was obeying.
 *   INJECTION  the carve-out naming our own events as safe could only identify
 *              them by the text they begin with — a property of the body, not
 *              of who wrote it.
 */
describe('a turn the server wrote, marked as the server’s', () => {
  it('wraps the body rather than replacing it', () => {
    const framed = String(frameServerTurn('the plan has just been approved'));

    expect(framed).toContain('the plan has just been approved');
    expect(framed.startsWith('[SYSTEM')).toBe(true);
    expect(framed.endsWith('[END SYSTEM]')).toBe(true);
  });

  it('says the two things the model got wrong: who wrote it, and what that means', () => {
    const framed = String(frameServerTurn('x'));

    expect(framed).toMatch(/not by the owner/i);
    // The language clause is the whole of 18 September in one sentence.
    expect(framed).toMatch(/says nothing about what language they speak/i);
  });

  it('is the same wrapper the defence describes, so the two cannot drift', () => {
    const framed = String(frameServerTurn('x'));
    const open = framed.split('\n')[0];

    expect(INJECTION_DEFENSE_PROMPT).toContain(open);
  });

  it('leaves a block-shaped body alone rather than mangling it', () => {
    // Tool-use and tool-result turns are arrays, never events — but this must
    // not corrupt one if a kind ever changes underneath it.
    const blocks = [{ type: 'text', text: 'hello' }] as never;

    expect(frameServerTurn(blocks)).toBe(blocks);
  });

  it('carries no Georgian, because its language is not a cue about the owner', () => {
    expect(String(frameServerTurn('x'))).not.toMatch(/[Ⴀ-ჿ]/);
  });
});
