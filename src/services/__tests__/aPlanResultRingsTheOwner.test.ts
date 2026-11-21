import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Autonomy stage 2, K7: when the plan's result is met the run calls
 * set_task_result, and the owner hears it — the result card on screen and the
 * push / WhatsApp template — even while other people are still awaited (the
 * goal's status is then `waiting`, which alone would ring nobody, #1255).
 */
describe('a result found by a goal’s own run', () => {
  const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');

  it('is news, so the app push goes — never to WhatsApp (Misho, 21 Nov)', () => {
    const gate = engine.indexOf('const carriesResult = result.taskResult !== undefined;');
    expect(gate).toBeGreaterThan(-1);
    const after = engine.slice(gate);
    expect(after).toMatch(/wakeIsNews\(status, [^)]*carriesResult\)/u);
    expect(after.slice(0, 2000)).toContain('{ notInWhatsapp: true }');
    const notices = readFileSync(join(__dirname, '..', 'notification.service.ts'), 'utf8');
    expect(notices).toContain('if (options.notInWhatsapp === true) return;');
    expect(notices).toContain('if (options.notInWhatsapp !== true) {');
  });

  it('still reaches the screen as the result card', () => {
    expect(engine).toContain('...(result.taskResult && { result: result.taskResult }),');
  });
});
