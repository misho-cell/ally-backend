import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 1 October — request 2245 was accepted through POST /requests/:ref/accept
 * with no channel, and the server read it as `direct`: the number goes. The
 * frontend (cf31663) showed no app build can send that; it was a direct API
 * call. The route now refuses it, as the chat tool always has.
 */
describe('an accept must say how to connect', () => {
  const route = readFileSync(join(__dirname, '..', 'requests.routes.ts'), 'utf8');

  it('refuses a channel-less accept before anything is resolved', () => {
    const refusal = route.indexOf("if (action === 'accept' && channel === undefined) {");
    expect(refusal).toBeGreaterThan(0);
    expect(route.indexOf('await resolveIntroductionRequest(', refusal)).toBeGreaterThan(refusal);
    expect(route.slice(refusal, refusal + 200)).toContain('res.status(400)');
  });

  it('says what is missing and that nothing changed', () => {
    expect(route).toContain('channel is direct or via_mediator. Nothing was changed.');
  });
});
