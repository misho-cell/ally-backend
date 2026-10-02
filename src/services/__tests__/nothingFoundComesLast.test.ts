/**
 * Plate v301 G2 (the tester's 982): goal replies opened with „found nothing in
 * your network" four times in four. One cause was ours: the empty-search note
 * told the model to „tell the owner plainly that their own network has nobody".
 */
import { withEmptySearchHistory } from '../chat.service';

const EMPTY = { found: false, query: 'notary' };

describe('the note after repeated empty searches', () => {
  it('no longer tells the model to lead with „nobody in your network"', () => {
    const run = 'run-g2';
    withEmptySearchHistory('search_by_tag', { tag_query: 'notary' }, run, EMPTY);
    const out = withEmptySearchHistory('search_by_tag', { tag_query: 'notari' }, run, EMPTY) as {
      note?: string;
    };

    expect(out.note).toBeDefined();
    expect(out.note).not.toContain('tell the owner plainly that their own network has nobody');
    expect(out.note).toContain('open with what you DID find');
    expect(out.note).toContain('never as the first sentence');
  });
});
