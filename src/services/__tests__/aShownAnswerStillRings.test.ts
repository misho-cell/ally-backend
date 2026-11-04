import { readFileSync } from 'fs';
import { join } from 'path';
import { wakeIsNews } from '../threadStatus.service';

/**
 * #8747 (Tornike, 4 Nov): Lika answered „yes, tomorrow at 7"; the answer was
 * put on his screen first, and the wake that followed — on a goal still
 * waiting on another helper — logged „a step (status waiting) — no push". No
 * push, no WhatsApp. An answer is news whether or not it was shown first.
 */
const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');
const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

describe('a wake that brings an answer', () => {
  it('rings even while the goal waits on someone else', () => {
    expect(wakeIsNews('waiting', true)).toBe(true);
    expect(wakeIsNews('waiting', false)).toBe(false);
  });

  it('counts as carrying an answer when the answer was shown first', () => {
    expect(engine).toContain('wakeIsNews(status, ensureQuoted !== undefined || carriesAnswer)');
    const shown = engine.slice(engine.indexOf('buildShownAnswersWakeEvent(arrived),'));
    expect(shown.slice(0, 160)).toContain('ANSWER_IS_NEWS');
    const relay = asks.slice(asks.indexOf('buildShownRelayAnswerWakeEvent(captured.fromName'));
    expect(relay.slice(0, 200)).toContain('ANSWER_IS_NEWS');
  });
});
