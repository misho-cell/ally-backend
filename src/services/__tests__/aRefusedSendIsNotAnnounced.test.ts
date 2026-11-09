import { readFileSync } from 'fs';
import { join } from 'path';
import { toolResultSucceeded } from '../chat.service';

/**
 * The tester's 79564 (a real member, 30 Oct): „✉️ <contact>-ის ასისტენტს
 * ვწერ…" was shown, and the ask itself was refused; nothing went. A step that
 * writes to someone is announced only once it has gone.
 */
const result = (content: unknown): Parameters<typeof toolResultSucceeded>[0] => ({
  type: 'tool_result',
  tool_use_id: 't',
  content: JSON.stringify(content),
});

describe('a send step', () => {
  it('counts as gone only without a refusal', () => {
    expect(toolResultSucceeded(result({ sent: true, ask_id: 1, to_name: 'A' }))).toBe(true);
    expect(toolResultSucceeded(result({ success: true, request_id: 2 }))).toBe(true);
    expect(toolResultSucceeded(result({ sent: false, error: 'no permission' }))).toBe(false);
    expect(toolResultSucceeded(result({ sent: false }))).toBe(false);
    expect(toolResultSucceeded({ type: 'tool_result', tool_use_id: 't', content: 'oops' })).toBe(
      false,
    );
  });

  it('is captioned after its result, the other steps before', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'if (captionWaitsForResult(block.name)) heldSendCaptions.set(block.id, progressMsg);',
    );
    expect(chat).toContain('if (caption !== undefined && toolResultSucceeded(results[i])) {');
    for (const tool of ["'ask_contact'", "'request_introduction'", "'relay_ask'"]) {
      expect(chat.slice(chat.indexOf('const SEND_STEP_TOOLS'))).toContain(tool);
    }
  });
});

/** Tornike's 8 Nov report: „saving…" showed under a save that was refused. */
describe('a save step', () => {
  it('is captioned only once it was kept', () => {
    expect(toolResultSucceeded(result({ saved: true }))).toBe(true);
    expect(toolResultSucceeded(result({ saved: false, reason: 'not for this message' }))).toBe(
      false,
    );
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const saves = chat.slice(chat.indexOf('const SAVE_STEP_TOOLS'));
    for (const tool of [
      'save_contact_fact',
      'save_contact_insight',
      'update_user_profile',
      'save_private_context',
    ]) {
      expect(saves.slice(0, 400)).toContain(`'${tool}'`);
    }
    expect(chat).toContain(
      'return SEND_STEP_TOOLS.has(toolName) || SAVE_STEP_TOOLS.has(toolName);',
    );
  });
});
