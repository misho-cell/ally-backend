import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * D709 (the founder, 7 Oct): „Yes, connect them" connects them, and the
 * mediator is not asked how. The route used to refuse an accept with no
 * channel (1 October); now the resolver picks one, on G6's rule.
 */
describe('an accept through the app button', () => {
  const route = readFileSync(join(__dirname, '..', 'requests.routes.ts'), 'utf8');
  const service = readFileSync(
    join(__dirname, '..', '..', '..', 'services', 'introduction.service.ts'),
    'utf8',
  );

  it('is not refused for naming no channel', () => {
    expect(route).not.toContain("if (action === 'accept' && channel === undefined) {");
    expect(route).not.toContain('Nothing was changed.');
  });

  it('is read as direct, which degrades honestly when no number is found', () => {
    expect(service).toContain(
      'const channel: IntroChannel = opts.channel ?? INTRO_CHANNEL_WHEN_UNSAID;',
    );
    expect(service).toContain("const INTRO_CHANNEL_WHEN_UNSAID: IntroChannel = 'direct';");
  });
});
