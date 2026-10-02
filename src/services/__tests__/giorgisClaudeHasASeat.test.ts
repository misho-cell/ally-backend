/**
 * Misho, 2 October: Giorgi's Claude could not post to the board — the author
 * list held only the four seats — and it refused to write under another name.
 */
import { HANDOFF_AUTHORS_TEXT, isHandoffAuthor } from '../handoff.service';

describe("Giorgi's Claude on the board", () => {
  it('is an author of its own', () => {
    expect(isHandoffAuthor('giorgi_claude')).toBe(true);
  });

  it('is named in the refusal a wrong author gets', () => {
    expect(HANDOFF_AUTHORS_TEXT).toContain('giorgi_claude');
    expect(HANDOFF_AUTHORS_TEXT).toContain('claude_backend');
  });

  it('still refuses a free-text author', () => {
    expect(isHandoffAuthor('giorgi')).toBe(false);
  });
});
