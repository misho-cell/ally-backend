jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { requestThisThreadPassesOn } from '../forwardedIntro';
import { forwardedRequestOpening, forwardedRequestPush } from '../introOpening';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => mockQuery.mockReset());

/** 5347 (tester 61837): in the link's request thread, the request that goes on is the owner's. */
describe('the owner’s request a link passes on', () => {
  it('is read from the link’s own request thread, with the owner’s target, reason and goal', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ requester_user_id: 500, target_name: 'T', message: 'why', requester_task_id: 41 }],
    } as never);

    await expect(requestThisThreadPassesOn('600', 54282)).resolves.toEqual({
      ownerUserId: '500',
      targetName: 'T',
      reason: 'why',
      ownerTaskId: 41,
    });
    const [sql, params, timeout] = mockQuery.mock.calls[0] as [string, unknown[], number];
    expect(sql).toContain("t.type = 'incoming_request'");
    expect(sql).toContain("ir.ask_type <> 'direct'");
    expect(params).toEqual([54282, '600']);
    expect(timeout).toBeGreaterThan(0);
  });

  it('is nothing in any other thread', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    await expect(requestThisThreadPassesOn('600', 1)).resolves.toBeNull();
  });

  it('opens by naming whose assistant passed it on, for whom, and the owner’s reason', () => {
    const ka = forwardedRequestOpening('ka', 'ლაშა', 'ანა', 'ეკა', 'ბუღალტერი სჭირდება');
    // #6634 / D590: first person, never „…-ის სახელით".
    expect(ka).toContain('დამიკავშირდა **ლაშას ასისტენტი**');
    expect(ka).toContain('იცნობ თუ არა **ეკას** და შეძლებ თუ არა დააკავშირო');
    expect(ka).not.toContain('სახელით');
    expect(ka).toContain('რაზეა საქმე: ბუღალტერი სჭირდება');
    expect(ka).toContain('დაეხმარები? 🤝');

    const en = forwardedRequestOpening('en', 'Lasha', 'Ana', 'Eka', null);
    expect(en).toBe(
      "Hello! **Lasha's assistant** is asking you, on behalf of Ana, to introduce Ana to " +
        '**Eka**.\n\nWill you help? 🤝',
    );
  });

  it('says the same in the push', () => {
    const push = forwardedRequestPush('ლაშა', 'ანა', 'ეკა');
    expect(push).toContain('დამიკავშირდა ლაშას ასისტენტი');
    expect(push).not.toContain('სახელით');
  });
});
