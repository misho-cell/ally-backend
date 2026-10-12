import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Ops' daily check (12 Oct): a duplicate caught on another goal has no previous
 * time, and „undefined წამის წინ" reached the model. The time is said only when known.
 */
describe('the already-sent refusal', () => {
  const source = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

  it('names the seconds only when they are known', () => {
    expect(source).toContain(
      "(secondsSincePrevious === undefined ? '' : `${secondsSincePrevious} წამის წინ `)",
    );
    expect(source).not.toContain('უკვე გაუგზავნე ${secondsSincePrevious} წამის წინ');
  });
});
