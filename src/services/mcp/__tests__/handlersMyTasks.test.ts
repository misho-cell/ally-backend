// get_my_tasks on the connector — Ticket 17 Task 99. Everything the handlers
// module pulls in is mocked away; only the consent reading is real.
jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../../taskStore.service', () => ({
  __esModule: true,
  getMyTasksPage: jest.fn(),
}));

import { getMyTasksPage } from '../../taskStore.service';
import { mcpGetMyTasks } from '../handlers';

const mockPage = getMyTasksPage as jest.MockedFunction<typeof getMyTasksPage>;

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-for-refs';
});
beforeEach(() => jest.clearAllMocks());

/** Goal 1619 as it actually stands: the founder's „ბათუმის ფოტოგრაფი", 20 Aug. */
function goal(over: Record<string, unknown>): unknown {
  return {
    id: 1619,
    user_id: '501',
    title: 'ბათუმის ფოტოგრაფი',
    description: null,
    task_type: 'task_main',
    status: 'open',
    permission_granted: true,
    plan: null,
    plan_proposed: null,
    plan_approved_at: null,
    plan_version: 0,
    ...over,
  };
}

function page(tasks: unknown[]): never {
  return { tasks, total: tasks.length } as never;
}

interface Row {
  permission_granted: boolean;
  consent: string;
}

async function rowFor(over: Record<string, unknown>): Promise<Row> {
  mockPage.mockResolvedValue(page([goal(over)]));
  const out = (await mcpGetMyTasks('501', {})) as { tasks: Row[] };
  return out.tasks[0];
}

describe('get_my_tasks — permission_granted says what the gate will do', () => {
  it('reads false while a proposed plan waits for its yes, legacy grant or not', async () => {
    // The read that made the two screens look like they disagreed: an August
    // grant, a proposed plan v1, no approval. The ask gate refuses this goal.
    const row = await rowFor({ plan_proposed: { summary: 'გეგმა v1' }, plan_version: 1 });

    expect(row.permission_granted).toBe(false);
    expect(row.consent).toBe('plan_awaiting_yes');
  });

  it('keeps the legacy grant where no plan was ever proposed', async () => {
    const row = await rowFor({});

    expect(row.permission_granted).toBe(true);
    expect(row.consent).toBe('legacy_grant');
  });

  it('reads true once the plan carries its approval', async () => {
    const row = await rowFor({
      plan: { summary: 'გეგმა v1' },
      plan_proposed: { summary: 'გეგმა v1' },
      plan_approved_at: '2026-09-12T10:00:00.000Z',
      plan_version: 1,
    });

    expect(row.permission_granted).toBe(true);
    expect(row.consent).toBe('plan_approved');
  });

  it('never turns no consent into some', async () => {
    const row = await rowFor({ permission_granted: false });

    expect(row.permission_granted).toBe(false);
    expect(row.consent).toBe('none');
  });
});
