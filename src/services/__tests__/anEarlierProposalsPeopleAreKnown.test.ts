jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { peopleAddedToPlan, plansPeopleSoFar } from '../chat.service';

const LIKA = { name: 'ლიკა გამოგონილი', phone: '+995500000101' };
const TURA = { name: 'ტურა გამოგონილი', phone: '+995500000102' };
const NEW = { name: 'ახალი გამოგონილი', phone: '+995500000103' };

/** K15 (thread 76858, 4 Nov 12:11): a plan proposed again was refused for its own earlier people. */
describe('the people of an earlier proposal are already known', () => {
  it('counts the plan in force and the proposal waiting', () => {
    const known = plansPeopleSoFar({
      plan: { people_to_involve: [LIKA] },
      plan_proposed: { people_to_involve: [TURA] },
    });
    const added = peopleAddedToPlan({ people_to_involve: [LIKA, TURA, NEW] }, known);
    expect(added).toEqual([NEW]);
  });

  it('knows nobody when there is no plan yet', () => {
    expect(plansPeopleSoFar({ plan: null, plan_proposed: null })).toBeNull();
    expect(plansPeopleSoFar(null)).toBeNull();
  });

  it('is what propose_task_plan checks new people against', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toMatch(
      /input\['plan'\],\s+plansPeopleSoFar\(planTask\),\s+withEarlierWays\(runWayInPhones\.get\(runId\), await waysFoundBefore\(threadId\)\),/,
    );
  });
});
