import { readFileSync } from 'fs';
import { join } from 'path';

const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

import { goalFirstAsk, goalFirstAskSection } from '../goalFirstAsk';

/** D713, phase 1: the owner's first ask on a goal is pinned on every turn. */
const FIRST = 'მჭირდება კარგი ბუღალტერი, რომელიც მცირე ბიზნესს იცნობს';

beforeEach(() => mockQuery.mockReset());

describe("the goal's first ask", () => {
  it('is the owner line the goal was opened from', async () => {
    mockQuery.mockResolvedValue({ rows: [{ content: ` ${FIRST} ` }] });
    await expect(goalFirstAsk(20200)).resolves.toBe(FIRST);
    expect(mockQuery.mock.calls[0][1]).toEqual([20200]);
    expect(String(mockQuery.mock.calls[0][0])).toContain('c.created_at <= t.created_at');
  });

  it('is empty when the read fails, and the run goes on', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(goalFirstAsk(20200)).resolves.toBe('');
  });

  it('is carried word for word in its own section', () => {
    const section = goalFirstAskSection(FIRST);
    expect(section).toContain(`„${FIRST}"`);
    expect(section).toContain('D713');
    expect(goalFirstAskSection('  ')).toBe('');
  });

  it('is cut at a fixed length', () => {
    expect(goalFirstAskSection('ა'.repeat(2000)).length).toBeLessThan(1200);
  });

  it('is in every goal run, beside the goal itself', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('goalFirstAskSection(await goalFirstAsk(boundTask.id))');
    expect(chat).toMatch(/waveNote \+\s+firstAsk \+/u);
  });
});
