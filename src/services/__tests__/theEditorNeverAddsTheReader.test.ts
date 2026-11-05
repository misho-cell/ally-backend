import { readFileSync } from 'fs';
import { join } from 'path';
import { editAddsTheReader, namesTheReader } from '../askerInNeed';

const DRAFT = 'იცნობ კარგ ელექტრიკოსს, ვისი რეკომენდაციაც შეგიძლია?';
const EDITED = 'ლაშა დოლიძეს იცნობ კარგ ელექტრიკოსს?';

/** Tester 82998 (thread 80293): the editor glued the reader's own name in front. */
describe('the ask editor never writes the reader into their own question', () => {
  it('sees the reader’s name in either alphabet, with its case ending', () => {
    expect(namesTheReader(EDITED, 'Lasha Dolidze')).toBe(true);
    expect(namesTheReader(EDITED, 'ლაშა დოლიძე')).toBe(true);
    expect(namesTheReader('Lasha, do you know an electrician?', 'Lasha Dolidze')).toBe(true);
    expect(namesTheReader(DRAFT, 'Lasha Dolidze')).toBe(false);
  });

  it('keeps the draft when only the edit names the reader', () => {
    expect(editAddsTheReader(DRAFT, EDITED, 'Lasha Dolidze')).toBe(true);
    expect(editAddsTheReader(DRAFT, 'იცნობ კარგ ელექტრიკოსს?', 'Lasha Dolidze')).toBe(false);
    expect(editAddsTheReader(EDITED, EDITED, 'Lasha Dolidze')).toBe(false);
    expect(editAddsTheReader(DRAFT, EDITED, null)).toBe(false);
  });

  it('is checked on the editor’s version before it leaves', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain('editAddsTheReader(relayed.text, editorsDraft.question, toName)');
  });
});
