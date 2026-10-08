import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 958 (FAILED 8 Oct, the tester's 47523): „როგორ ხარ?" 8.3 s, „მადლობა!" 8.9 s.
 * Of that, about a second was five reads in a row for the server's own answers
 * and taps — none of which a listed small-talk line can be. It skips them.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('a listed small-talk line skips the server’s own answers and taps (958)', () => {
  it('is decided once, before the first of them', () => {
    const decided = chat.indexOf('const serverMayAnswer = !ownerAbsent && !listedSmallTalk;');
    expect(decided).toBeGreaterThan(-1);
    expect(chat.indexOf('? await answerNonMemberNamed(')).toBeGreaterThan(decided);
  });

  it.each([
    "serverMayAnswer && thread.type === 'regular'\n      ? await answerNonMemberNamed(",
    "serverMayAnswer && thread.type === 'regular'\n      ? await answerNotTagged(",
    "serverMayAnswer && thread.type === 'regular'\n      ? await answerFactConfirm(",
    "serverMayAnswer && thread.type === 'incoming_ask'\n      ? await sendPreparedOnYes(",
    'const approvedByTap = !serverMayAnswer',
    'const openAsksSettled = !serverMayAnswer',
    'const introAccepted = !serverMayAnswer',
  ])('gated: %s', (gate) => {
    expect(chat).toContain(gate);
  });
});
