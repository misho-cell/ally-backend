import { readFileSync } from 'fs';
import { join } from 'path';
import { listDownloadNote } from '../chat.service';

/**
 * #894 / #1323 (Lika, 5 Oct): asked for her list with results as Excel, she was
 * told no file could be made and was offered a contact search instead.
 */
describe('the list comes back as Excel', () => {
  it('points to the goal card’s download once the list is worked, and runs no search', () => {
    const note = listDownloadNote({ rows: { route: 3, no_route: 2 }, asks: {} });
    expect(note).toContain('download button on this goal');
    expect(note).toContain('Never say a file cannot be made');
    expect(note).toContain('run no search');
  });

  it('says there is no Excel yet for a list never worked', () => {
    expect(listDownloadNote({ rows: {}, asks: {} })).toContain('There is no Excel yet');
  });

  it('is what list_status answers, and the tool is reached for a file request', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('return { ...status, download: listDownloadNote(status) }');
    expect(chat).toContain("'file, a table, Excel or a download.'");
  });
});
