import { readFileSync } from 'fs';
import { join } from 'path';

/** The frontend's 14:35Z (#6074): the app reads the export's file name across origins. */
describe('an export keeps its own file name in the app', () => {
  it('exposes Content-Disposition beside Retry-After', () => {
    const index = readFileSync(join(__dirname, '..', '..', 'index.ts'), 'utf8');
    expect(index).toContain("exposedHeaders: ['Retry-After', 'Content-Disposition']");
  });
});
