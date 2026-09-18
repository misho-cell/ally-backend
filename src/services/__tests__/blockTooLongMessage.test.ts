import { BLOCK_TOO_LONG_MESSAGE, MAX_BLOCK_CONTENT_CHARS } from '../promptBlocks.service';

/**
 * Ticket 20 row 215 — the cap said no and did not say what to do instead.
 *
 * 18 September. The seat had a rule the founder had approved that evening,
 * went to add it to `task_main`, and got:
 *
 *   400  content too long (max 30000 chars per block)
 *   task_main  29,964 / 30,000     36 characters of headroom
 *
 * Every word of that is true and it cost them the evening. They concluded the
 * goal prompt was closed for good — „not this rule, not the next one, not
 * anything either of us thinks of tomorrow" — went looking for a POST to make
 * a second block with, found none, and wrote to me.
 *
 * A mode may hold several blocks and always could. PUT to a name that does not
 * exist creates it; five blocks in the production database were made that way.
 * task_step had 10,036 characters of room under the mode budget the whole
 * time, and the rule was 851.
 *
 * So this is not a test about wording. It is the one line that decides whether
 * the next person loses an evening to a wall that has a door in it.
 */
describe('the per-block cap refusal', () => {
  it('still says plainly what was refused and what the cap is', () => {
    expect(BLOCK_TOO_LONG_MESSAGE).toContain('content too long');
    expect(BLOCK_TOO_LONG_MESSAGE).toContain(String(MAX_BLOCK_CONTENT_CHARS));
  });

  it('says a mode may hold more than one block — the thing nobody knew', () => {
    expect(BLOCK_TOO_LONG_MESSAGE).toMatch(/several blocks/i);
  });

  it('names the action, not just the fact', () => {
    // „Shorten it" was the only reading available before, and shortening
    // task_main means cutting rules that took days to land.
    expect(BLOCK_TOO_LONG_MESSAGE).toContain('PUT');
    expect(BLOCK_TOO_LONG_MESSAGE).toMatch(/sort_order/);
    expect(BLOCK_TOO_LONG_MESSAGE).toMatch(/modes/);
  });

  it('points at the live example, so the reader can check it rather than trust it', () => {
    expect(BLOCK_TOO_LONG_MESSAGE).toContain('qa_main');
    expect(BLOCK_TOO_LONG_MESSAGE).toContain('qa_rules_20_22');
  });

  it('names the limit that actually binds, and where to read it', () => {
    // The per-block cap is not the ceiling on a mode. Somebody who works
    // around this refusal has to know which number stops them next.
    expect(BLOCK_TOO_LONG_MESSAGE).toMatch(/per-mode budget/i);
    expect(BLOCK_TOO_LONG_MESSAGE).toContain('mode_totals');
  });

  it('carries the cap as a number, never as a word that can go stale', () => {
    // The cap moved 20k → 30k once already, and a hardcoded „30000" in a
    // second place is how the route came to refuse at a stale 20,000 while
    // the page counted to 30,000 (ticket 8 task 10).
    expect(BLOCK_TOO_LONG_MESSAGE).not.toMatch(/\b20000\b|\b20,000\b/);
  });
});
