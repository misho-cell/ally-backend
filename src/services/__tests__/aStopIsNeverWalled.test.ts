import { readFileSync } from 'fs';
import { join } from 'path';
import { looksLikeStopRequest } from '../stopIntent';

/**
 * The master test run's 45679: a typed stop on a zero balance was refused
 * with 402, while the stop button's route worked. The typed stop is answered
 * by the server alone, before any model call, so it is never walled.
 */
describe('a typed stop on an empty wallet', () => {
  const route = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'threads.routes.ts'),
    'utf8',
  );
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('skips the wallet gate', () => {
    expect(route).toContain('const typedStop = looksLikeStopRequest(message);');
    expect(route).toMatch(/payerId === null \|\| typedStop\s+\? \{ allowed: true as const \}/u);
    expect(route.indexOf('const typedStop')).toBeLessThan(
      route.indexOf('checkRunAllowance(payerId)'),
    );
  });

  it('is read by the same words the run answers without a model', () => {
    expect(chat).toContain('if (!ownerAbsent && looksLikeStopRequest(userMessage)) {');
    expect(looksLikeStopRequest('შეაჩერე ეს მიზანი.')).toBe(true);
    expect(looksLikeStopRequest('სანტექნიკი მჭირდება')).toBe(false);
  });
});
