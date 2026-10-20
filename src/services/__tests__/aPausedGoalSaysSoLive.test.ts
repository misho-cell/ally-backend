jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../sse.service', () => ({ __esModule: true, emitThreadUpdated: jest.fn() }));
jest.mock('../threadStatus.service', () => ({
  __esModule: true,
  setThreadStatus: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../threads.service', () => ({
  __esModule: true,
  userLanguage: jest.fn().mockResolvedValue('ka'),
}));

import { query } from '../../db/postgres/client';
import { emitThreadUpdated } from '../sse.service';
import { updateTask } from '../taskStore.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockEmit = emitThreadUpdated as jest.Mock;

beforeEach(() => {
  mockQuery.mockReset();
  mockEmit.mockReset();
});

/** #5283 (the frontend's 22:05Z): the open list keeps a paused goal by `goal_paused`. */
describe('pausing a goal', () => {
  it('tells every open screen at once that the goal is paused', async () => {
    mockQuery.mockResolvedValue({ rows: [{ thread_id: 62635 }], rowCount: 1 } as never);
    await expect(updateTask('7', 30394, 'paused')).resolves.toBe(true);
    expect(mockEmit).toHaveBeenCalledWith('7', { id: 62635, goal_paused: true });
  });

  it('says nothing when no goal was paused', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await updateTask('7', 30394, 'paused');
    expect(mockEmit).not.toHaveBeenCalled();
  });
});
