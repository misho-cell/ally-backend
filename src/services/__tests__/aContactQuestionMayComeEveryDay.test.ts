import { readFileSync } from 'fs';
import { join } from 'path';

/** D708 (the founder, 7 Oct): one curiosity question a day per owner, not one a week. */
describe('the curiosity interval', () => {
  it('is one day unless the environment says otherwise', () => {
    const queue = readFileSync(join(__dirname, '..', 'curiosityQueue.service.ts'), 'utf8');
    expect(queue).toContain('Number(process.env.CURIOSITY_SURFACE_INTERVAL_DAYS ?? 1)');
  });
});
