import { readFileSync } from 'fs';
import { join } from 'path';
import { ASK_REFUSED_THIS_RUN_NUDGE, claimsAnAskWasSent } from '../replyGuards';

/**
 * #7229 (the tester's audit: 63406, 63823, 63413): every ask a run tried was
 * refused, and the reply still said „I wrote to X". The goal had written to
 * other people earlier, so the #2113 guard (a goal that sent nothing) let it
 * through. A send claimed in a run whose every ask was refused is now caught.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('a send claimed after every ask in the run was refused', () => {
  it('records a refused ask per run, and forgets it with the run', () => {
    expect(chat).toContain(
      'if ((askOutcome as { sent?: unknown }).sent !== true && runId) runAskRefused.add(runId);',
    );
    expect(chat).toContain('runAskRefused.delete(runId);');
  });

  it('fires only when nothing in the run went out and the reply claims a send', () => {
    const guard = chat.slice(chat.indexOf('const claimedARefusedAsk ='));
    const body = guard.slice(0, guard.indexOf(';'));
    expect(body).toContain('runAskRefused.has(runId)');
    expect(body).toContain('!runAskSent.has(runId)');
    expect(body).toContain('claimsAnAskWasSent(finalText)');
    expect(body).toContain("runModes.get(runId) !== 'incoming_ask'");
  });

  it('rewrites the reply with its own note, not the „nothing was ever sent" one', () => {
    expect(chat).toContain('? ASK_REFUSED_THIS_RUN_NUDGE');
    expect(chat).toContain('      claimedARefusedAsk ||');
    expect(ASK_REFUSED_THIS_RUN_NUDGE).toContain('ამ ნაბიჯში ყველა გაგზავნა უარყოფილი იყო');
  });

  it('reads „I wrote" as a claim and „I could not send" as none', () => {
    expect(claimsAnAskWasSent('ომიკოს ასისტენტს მივწერე.')).toBe(true);
    expect(claimsAnAskWasSent('ომიკოს ასისტენტთან ვერ გავგზავნე.')).toBe(false);
  });
});
