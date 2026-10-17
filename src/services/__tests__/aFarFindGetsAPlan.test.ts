jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { farFindLeftUnplanned } from '../chat.service';
import { farFindUnplannedNudge } from '../replyGuards';

/**
 * 5347, the tester's 63930 (56071, 56077): the walk found Zurab further out and
 * the reply only asked in prose „shall I ask Levan's assistant?" — no plan, no
 * card, nothing for the owner to tap.
 */
describe('somebody found further out', () => {
  const noPlan = { status: 'open' as const, plan: null, plan_proposed: null };
  const zurab = ['ზურაბ ქობულაძე'];

  it('sends the run back for a plan when nothing acted and the goal has none', () => {
    expect(farFindLeftUnplanned(zurab, ['search_second_degree', 'web_search'], noPlan)).toBe(true);
  });

  it('is left alone once the run proposed a plan or asked someone', () => {
    expect(farFindLeftUnplanned(zurab, ['find_warm_path', 'propose_task_plan'], noPlan)).toBe(
      false,
    );
    expect(farFindLeftUnplanned(zurab, ['ask_contact'], noPlan)).toBe(false);
  });

  it('is left alone when the goal already has a plan, or there is no goal', () => {
    expect(farFindLeftUnplanned(zurab, [], { ...noPlan, plan_proposed: {} as never })).toBe(false);
    expect(farFindLeftUnplanned(zurab, [], { ...noPlan, status: 'paused' })).toBe(false);
    expect(farFindLeftUnplanned(zurab, [], null)).toBe(false);
  });

  it('needs somebody found', () => {
    expect(farFindLeftUnplanned([], [], noPlan)).toBe(false);
  });

  it('names who was found and the tools that make the card', () => {
    const nudge = farFindUnplannedNudge(zurab);
    expect(nudge).toContain('ზურაბ ქობულაძე');
    expect(nudge).toContain('find_warm_path');
    expect(nudge).toContain('propose_task_plan');
    expect(nudge).toContain('present_choices');
  });
});
