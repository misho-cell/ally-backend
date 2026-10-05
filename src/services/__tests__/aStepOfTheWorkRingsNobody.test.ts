import { readFileSync } from 'fs';
import { join } from 'path';
import { wakeIsNews } from '../threadStatus.service';

/**
 * #1255 — „let this thing leave me alone": a push for a result or a question,
 * never for a step of the work.
 */
describe('which wake is worth a push', () => {
  it('rings for a question to the owner', () => {
    expect(wakeIsNews('needs_you', false)).toBe(true);
  });

  it('rings when the goal is done', () => {
    expect(wakeIsNews('done', false)).toBe(true);
  });

  it('rings when the wake carries someone’s answer, even while others are still asked', () => {
    expect(wakeIsNews('waiting', true)).toBe(true);
  });

  it('stays silent for a step that leaves the goal waiting on others', () => {
    expect(wakeIsNews('waiting', false)).toBe(false);
  });

  it('is asked by the wake before it pushes', () => {
    const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');
    const gate = engine.indexOf('if (!wakeIsNews(status, ensureQuoted !== undefined))');
    const push = engine.indexOf('void sendPushNotification(ownerId', gate);
    expect(gate).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(gate);
  });
});
