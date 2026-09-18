// The plan tools on the connector (Ticket 10 Task 21). Everything else the
// handlers module pulls in is mocked away; only the ref decoding is real.
jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../../taskPlans.service', () => ({
  __esModule: true,
  proposeTaskPlan: jest.fn(),
  approveTaskPlan: jest.fn(),
}));
// The engine is reached through a dynamic import (it imports the chat service,
// which imports this one), so the module is mocked whole rather than the call.
jest.mock('../../taskEngine.service', () => ({ __esModule: true, startDayOne: jest.fn() }));

import { approveTaskPlan, proposeTaskPlan } from '../../taskPlans.service';
import { startDayOne } from '../../taskEngine.service';
import { encodeContactRef } from '../contactRef';
import { mcpApproveTaskPlan, mcpProposeTaskPlan } from '../handlers';

const mockPropose = proposeTaskPlan as jest.MockedFunction<typeof proposeTaskPlan>;
const mockApprove = approveTaskPlan as jest.MockedFunction<typeof approveTaskPlan>;

/** The day-one call is fired and not awaited — let its import settle first. */
const settled = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-for-refs';
});
beforeEach(() => jest.clearAllMocks());

describe('propose_task_plan on the connector', () => {
  it('decodes every contact_ref into the phone the plan stores — no number crosses the boundary', async () => {
    mockPropose.mockResolvedValue({ ok: true, value: { version: 1, summary: 'გეგმა v1' } });
    const lika = encodeContactRef('501', '+995599111222');
    const nana = encodeContactRef('501', '+995599999999');

    const out = await mcpProposeTaskPlan('501', {
      task_ref: 'task_1619',
      plan: {
        solved_when: 'x',
        routes: [{ name: 'ქსელი' }],
        people_to_involve: [{ name: 'ლიკა', contact_ref: lika, route: 'ქსელი' }],
        never_contact: [{ name: 'ნანა', contact_ref: nana }, { name: 'ყოფილი პარტნიორი' }],
      },
    });

    expect(out).toEqual({ proposed: true, version: 1, summary: 'გეგმა v1' });
    expect(mockPropose).toHaveBeenCalledWith('501', 1619, {
      solved_when: 'x',
      routes: [{ name: 'ქსელი' }],
      people_to_involve: [{ name: 'ლიკა', phone: '+995599111222', route: 'ქსელი' }],
      never_contact: [{ name: 'ნანა', phone: '+995599999999' }, { name: 'ყოფილი პარტნიორი' }],
    });
  });

  it('refuses a ref minted for another user, naming the person', async () => {
    const foreign = encodeContactRef('777', '+995599111222');

    const out = await mcpProposeTaskPlan('501', {
      task_ref: 'task_1619',
      plan: {
        solved_when: 'x',
        routes: [{ name: 'ქსელი' }],
        people_to_involve: [{ name: 'ლიკა', contact_ref: foreign, route: 'ქსელი' }],
        never_contact: [],
      },
    });

    expect(out.proposed).toBe(false);
    expect(String(out.error)).toContain('ლიკა');
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it('an unknown task_ref is refused before anything is decoded', async () => {
    const out = await mcpProposeTaskPlan('501', { task_ref: 'nope', plan: {} as never });
    expect(out.proposed).toBe(false);
    expect(mockPropose).not.toHaveBeenCalled();
  });
});

describe('approve_task_plan on the connector', () => {
  it('records nothing without confirmed: true — the same gate as in the app', async () => {
    const out = await mcpApproveTaskPlan('501', { task_ref: 'task_1619', confirmed: false });
    expect(out.approved).toBe(false);
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it('records the yes', async () => {
    mockApprove.mockResolvedValue({
      ok: true,
      value: {
        version: 2,
        summary: 'გეგმა v2',
        alreadyInForce: false,
        approvedAt: '2026-09-18T12:52:08.012Z',
      },
    });
    const out = await mcpApproveTaskPlan('501', { task_ref: 'task_1619', confirmed: true });
    await settled();
    expect(out).toEqual({
      approved: true,
      version: 2,
      summary: 'გეგმა v2',
      already_approved: false,
    });
    expect(mockApprove).toHaveBeenCalledWith('501', 1619);
    expect(startDayOne).toHaveBeenCalledWith(1619);
  });

  /**
   * Row 209. Day one is what writes to the plan's people, so it runs once per
   * approval and not once per CALL to approve. The app path raced two runs into
   * this on goal 5580; the connector can be called twice just as easily, and
   * the second call changes nothing in the database by construction.
   */
  it('starts no second day one for a plan that is already in force', async () => {
    mockApprove.mockResolvedValue({
      ok: true,
      value: {
        version: 2,
        summary: 'გეგმა v2',
        alreadyInForce: true,
        approvedAt: '2026-09-18T12:52:08.012Z',
      },
    });

    const out = await mcpApproveTaskPlan('501', { task_ref: 'task_1619', confirmed: true });
    await settled();

    // Still a success — the plan IS approved, which is what the caller asked
    // for — and it says plainly that this call changed nothing.
    expect(out.approved).toBe(true);
    expect(out.already_approved).toBe(true);
    expect(startDayOne).not.toHaveBeenCalled();
  });
});
