import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Tornike's 8 Nov report, #4: in Misho's own chat (6 Nov, 16:06–16:42), twelve
 * sends were refused with „this wave's 3 questions are already sent". Waves
 * pace the work Netai does on its own between the owner's visits. When the
 * owner is in the conversation and the send is on his word, they give way, as
 * the per-person daily limit already does (#7628). Nobody is flooded: the
 * per-person 24-hour limit and the pacing still hold.
 */
const ASKS = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
const CHAT = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('waves in the owner’s own turn', () => {
  it('give way before anything else is asked', () => {
    const gate = ASKS.slice(ASKS.indexOf('const room = await waveRoomFor('));
    expect(gate.indexOf('ownerAskedNow === true ||')).toBeGreaterThan(-1);
    expect(gate.indexOf('ownerAskedNow === true ||')).toBeLessThan(
      gate.indexOf('introAccepted ||'),
    );
  });

  it('only when the owner is in the run', () => {
    const ask = CHAT.slice(CHAT.indexOf('const askOutcome = await createAsk('));
    expect(ask.slice(0, 900)).toContain('!ownerAbsent,');
  });
});
