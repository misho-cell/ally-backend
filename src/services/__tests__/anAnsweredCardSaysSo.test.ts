jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { answersForAsks } from '../pendingUpdates.service';
import { answeredDetail, debriefAskId } from '../updateCard';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * Row 230, Ninia's phone (1 October): her updates screen said „… ჯერ არ
 * გიპასუხა" on many cards, and the answers she did receive were nowhere on it.
 * Three of her eight shown debriefs were about questions already answered.
 */
describe('a debrief card once its question was answered', () => {
  it('says who answered, and what', () => {
    expect(answeredDetail('Tornike Abuladze', 'კი,\n ვიცნობ ერთს', 'ka')).toBe(
      'Tornike Abuladze გიპასუხა: „კი, ვიცნობ ერთს"',
    );
    expect(answeredDetail('Lika', 'Yes', 'en')).toBe('Lika answered: “Yes”');
  });

  it('stays one line on the list', () => {
    expect(answeredDetail('Lika', 'ა'.repeat(500), 'ka').length).toBeLessThanOrEqual(200);
  });

  it('is found by the ask the card names, and only on a debrief', () => {
    expect(debriefAskId('debrief', { ask_id: 6470 })).toBe(6470);
    expect(debriefAskId('debrief', { ask_id: 'x' })).toBeNull();
    expect(debriefAskId('goal_question', { ask_id: 6470 })).toBeNull();
  });
});

describe('the answers are read once for the whole screen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads only answered asks, bounded, with a timeout', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 6470, answer: 'კი' }], rowCount: 1 } as never);
    expect(await answersForAsks([6470, 6470, 6471])).toEqual(new Map([[6470, 'კი']]));
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("status = 'answered'");
    expect(String(sql)).toContain('LIMIT');
    expect(params).toEqual([[6470, 6471]]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('asks nothing when no card names an ask', async () => {
    expect(await answersForAsks([])).toEqual(new Map());
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is wired into the screen’s list, on due and seen alike', () => {
    const route = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'updates.routes.ts'),
      'utf8',
    );
    expect(route).toContain('answersForAsks(askIds)');
    expect(route).toContain('updatePayload(u, titles, answers, language, followedIds)');
    expect(route).toContain('answered: answer !== undefined');
  });
});
