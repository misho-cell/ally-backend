const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { asksForReasoningSummary, SUMMARIZED_THINKING } from '../reasoningOnTestSeats';

/** Misho, 3 Nov (his „ა"): the reasoning summary on test seats only. */
describe('the reasoning summary', () => {
  beforeEach(() => mockQuery.mockReset());

  it('is asked for on a test seat', async () => {
    mockQuery.mockResolvedValue({ rows: [{ user_id: 7 }] });
    expect(await asksForReasoningSummary('7')).toBe(true);
  });

  it('is not asked for on a real person', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    expect(await asksForReasoningSummary('8')).toBe(false);
  });

  it('is not asked for when the seat check fails', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));
    expect(await asksForReasoningSummary('9')).toBe(false);
  });

  it('asks only for a readable summary of the adaptive thinking that runs anyway', () => {
    expect(SUMMARIZED_THINKING).toEqual({ type: 'adaptive', display: 'summarized' });
  });

  it('rides on the main model’s calls, never beside a forced tool', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'model === MODEL && opts.forceTool === undefined && (await asksForReasoningSummary(ctx.userId))',
    );
  });
});
