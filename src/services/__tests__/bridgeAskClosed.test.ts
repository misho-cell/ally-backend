jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * The seat's 387, raised as a question and it was the right one: „ask 3071 is
 * still `sent`, `answered_at` NULL — after its recipient answered, after the
 * relay it spawned completed, and after the requester was told."
 *
 * Two of two. Ask 2609 from 19 September is in the same state.
 *
 * It matters because `getPendingAsksForUser` selects `status = 'sent'`, so the
 * BRIDGE goes on being shown a question waiting for them, forever, about a
 * thing they already helped with.
 *
 * This file pins the SHAPE of the closing statement rather than the plumbing —
 * the statement is what carries the two decisions worth keeping.
 */
describe('the statement that closes the bridge’s own ask', () => {
  it('sets wake_delivered_at in the same write, or the sweep fires on a NULL answer', async () => {
    // listUnwokenAnswers takes every row with status='answered' AND
    // answered_at IS NOT NULL AND wake_delivered_at IS NULL, and delivers its
    // answer. The parent's answer column is NULL on purpose, so without this
    // the backstop would wake the asker's goal with nothing in it.
    const { readFileSync } = await import('fs');
    const src = readFileSync('src/services/taskAsks.service.ts', 'utf8');
    const stmt = src.slice(src.indexOf('async function closeTheBridgesOwnAsk'));
    const body = stmt.slice(0, stmt.indexOf('\n}'));

    expect(body).toContain("status = 'answered'");
    expect(body).toContain('answered_at = COALESCE(answered_at, NOW())');
    expect(body).toContain('wake_delivered_at = COALESCE(wake_delivered_at, NOW())');
    // Only a still-open ask is closed: an already-answered parent keeps its
    // own answer and its own timestamps.
    expect(body).toContain("status = 'sent'");
    // The answer column is never written — C's words are C's, and putting
    // them in B's ask would say B said them.
    expect(body).not.toMatch(/\bSET[\s\S]*?\banswer\s*=/);
  });

  it('is best-effort, so a tidy-up failure cannot cost the asker their answer', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('src/services/taskAsks.service.ts', 'utf8');
    const stmt = src.slice(src.indexOf('async function closeTheBridgesOwnAsk'));
    expect(stmt.slice(0, stmt.indexOf('\n}\n'))).toContain('.catch(');
  });

  it('leaves the query mock untouched — this file reads source, not behaviour', () => {
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
