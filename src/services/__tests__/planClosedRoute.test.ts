jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../closedRoute', () => ({
  __esModule: true,
  CLOSED_ROUTE_ON: true,
  CLOSED_ROUTE_LINE: 'Not sent: this route looks closed.',
  closedRouteFor: jest.fn(),
}));
jest.mock('../tools/requestIntroduction', () => ({
  __esModule: true,
  receiverInBridgesBook: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { closedRouteFor } from '../closedRoute';
import { closedPlanRoute, routeIntroductions } from '../planClosedRoute';
import { receiverInBridgesBook } from '../tools/requestIntroduction';

/** BF (1697, §128): a closed route is caught before the plan card, not after the owner approved it. */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockClosed = closedRouteFor as jest.MockedFunction<typeof closedRouteFor>;
const mockReceiver = receiverInBridgesBook as jest.MockedFunction<typeof receiverInBridgesBook>;
const PLAN = {
  solved_when: 'x',
  routes: [
    { name: 'ჩემი კონტაქტები', status: 'running' },
    {
      name: 'ნინოს გავლით',
      status: 'waiting',
      introduction: { via_phone: '995500000001', to_name: 'გია ტესტაძე' },
    },
  ],
};

beforeEach(() => {
  mockQuery.mockReset().mockResolvedValue({ rows: [{ user_id: 7 }], rowCount: 1 } as never);
  mockClosed.mockReset().mockResolvedValue(false);
  mockReceiver.mockReset().mockResolvedValue('995500000002');
});

describe('routeIntroductions', () => {
  it('reads only routes that name a bridge and a person', () => {
    expect(routeIntroductions(PLAN)).toEqual([
      { routeName: 'ნინოს გავლით', viaPhone: '995500000001', toName: 'გია ტესტაძე' },
    ]);
    expect(routeIntroductions({ routes: 'nope' })).toEqual([]);
    expect(routeIntroductions(null)).toEqual([]);
  });
});

describe('closedPlanRoute', () => {
  it('refuses the plan with the §110.1 line when a named introduction is closed', async () => {
    mockClosed.mockResolvedValue(true);
    await expect(closedPlanRoute(24, PLAN)).resolves.toEqual({
      proposed: false,
      closed_route: 'ნინოს გავლით',
      error: 'Not sent: this route looks closed.',
    });
    expect(mockReceiver).toHaveBeenCalledWith('7', 'გია ტესტაძე');
    expect(mockClosed).toHaveBeenCalledWith(24, '995500000001', '995500000002');
  });

  it('uses the receiver phone when the search gave it, without a phonebook read', async () => {
    const plan = {
      routes: [
        {
          name: 'r',
          status: 'running',
          introduction: { via_phone: '1', to_name: 'x', to_phone: '2' },
        },
      ],
    };
    await expect(closedPlanRoute(24, plan)).resolves.toBeNull();
    expect(mockReceiver).not.toHaveBeenCalled();
    expect(mockClosed).toHaveBeenCalledWith(24, '1', '2');
  });

  it('lets a plan without introductions, or with an open one, through', async () => {
    await expect(
      closedPlanRoute(24, { routes: [{ name: 'a', status: 'running' }] }),
    ).resolves.toBeNull();
    await expect(closedPlanRoute(24, PLAN)).resolves.toBeNull();
  });

  it('is checked in propose_task_plan, and the route field carries the approved description', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain("const closedRoute = await closedPlanRoute(taskId, input['plan']);");
    expect(chat).toContain('description: INTRODUCTION_FIELD_DESCRIPTION,');
  });
});
