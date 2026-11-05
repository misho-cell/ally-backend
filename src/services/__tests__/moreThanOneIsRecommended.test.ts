import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 2186: a helper may recommend more than one. #8779 b (rule 40, the founder 4 Nov
 * 19:07): a typed „both" / „all of them" is the model's reading, not a word list;
 * only a tap on a person's button is read by the server.
 */
describe('a helper may recommend more than one (2186, #8779)', () => {
  it('reads only the tapped person on the server', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain('return stored === null ? null : tappedPersonText(message, stored);');
    const choices = readFileSync(join(__dirname, '..', 'askChoices.ts'), 'utf8');
    expect(choices).not.toContain('ALL_OF_THEM_RE');
  });
});
