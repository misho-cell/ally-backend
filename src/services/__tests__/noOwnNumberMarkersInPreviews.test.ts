import { readFileSync } from 'fs';
import { join } from 'path';
import { withoutAllowMarkers } from '../privacyScrub';

/**
 * Giorgi, 9 Nov (#9050): a case card's preview read „+995⟦own⟧…⟦/own⟧"; the list
 * and the push read stored text, and only the chat took the markers off.
 */
describe('own-number markers outside the chat', () => {
  it('come off the text, the number staying as in the chat', () => {
    expect(withoutAllowMarkers('ნომერი: ⟦own⟧+995 555 00 00 00⟦/own⟧.')).toBe(
      'ნომერი: +995 555 00 00 00.',
    );
  });

  it('come off a preview clipped in the middle of a marker', () => {
    expect(withoutAllowMarkers('ნომერი: ⟦own⟧+995 555 00⟦/o')).toBe('ნომერი: +995 555 00');
    expect(withoutAllowMarkers('ნომერი ⟦')).toBe('ნომერი ');
  });

  it('are taken off in the list preview and in every push', () => {
    const threads = readFileSync(join(__dirname, '..', 'threads.service.ts'), 'utf8');
    expect(threads).toContain('scrubMechanicalForStorage(withoutAllowMarkers(row.last_message))');
    const push = readFileSync(join(__dirname, '..', 'notification.service.ts'), 'utf8');
    expect(push).toContain('body: withoutAllowMarkers(raw.body),');
  });
});
