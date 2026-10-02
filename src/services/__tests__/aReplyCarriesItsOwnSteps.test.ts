jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { ThreadMessage, withRunSteps } from '../threads.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function message(over: Partial<ThreadMessage>): ThreadMessage {
  return {
    id: 'm',
    role: 'assistant',
    content: 'პასუხი',
    kind: 'message',
    run_id: null,
    created_at: '2026-10-02T12:00:00Z',
    choices: null,
    ...over,
  } as ThreadMessage;
}

beforeEach(() => jest.clearAllMocks());

/** Team task #375, second half: the steps of a finished conversation, under each reply. */
describe('a reply in the history', () => {
  it('carries the steps its own run wrote, in order', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { run_id: 'r1', content: 'ვეძებ კონტაქტებში' },
        { run_id: 'r1', content: 'ვამოწმებ მეორე წრეს' },
      ],
    } as never);
    const page = [
      message({ id: 'u', role: 'user', content: 'მჭირდება იურისტი' }),
      message({ id: 'a', run_id: 'r1' }),
    ];

    const out = await withRunSteps(7, page);

    expect(out[0]).not.toHaveProperty('steps');
    expect(out[1].steps).toEqual(['ვეძებ კონტაქტებში', 'ვამოწმებ მეორე წრეს']);
    expect(mockQuery.mock.calls[0][1]).toEqual([7, ['r1'], expect.any(Number)]);
    // Misho, 2 Oct: the per-tool captions are kept too, so every run has steps.
    expect(String(mockQuery.mock.calls[0][0])).toContain("kind IN ('step', 'caption')");
  });

  it('gives the steps to the run’s last assistant message only', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ run_id: 'r1', content: 'ნაბიჯი' }] } as never);
    const page = [message({ id: 'a1', run_id: 'r1' }), message({ id: 'a2', run_id: 'r1' })];

    const out = await withRunSteps(7, page);

    expect(out[0]).not.toHaveProperty('steps');
    expect(out[1].steps).toEqual(['ნაბიჯი']);
  });

  it('adds nothing, and asks nothing, when no reply came from a run', async () => {
    const page = [message({ run_id: null })];
    expect(await withRunSteps(7, page)).toEqual(page);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('leaves a reply whose run stored no steps without the field', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    const out = await withRunSteps(7, [message({ run_id: 'r2' })]);
    expect(out[0]).not.toHaveProperty('steps');
  });
});
