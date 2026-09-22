jest.mock('../../db/postgres/client', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  __esModule: true,
}));
jest.mock('../taskAsks.service', () => ({
  __esModule: true,
  withdrawAsksToOptedOutPerson: jest.fn().mockResolvedValue(0),
}));

import { query } from '../../db/postgres/client';
import { withdrawAsksToOptedOutPerson } from '../taskAsks.service';
import { optOutFromAsks } from '../askOptOut.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockWithdraw = withdrawAsksToOptedOutPerson as jest.MockedFunction<
  typeof withdrawAsksToOptedOutPerson
>;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [] } as never);
});

/**
 * THE WIRING, which is the half a sabotage run keeps finding untested.
 *
 * `withdrawAsksToOptedOutPerson` has eight tests of its own and every one of
 * them passes with the call deleted from `optOutFromAsks` — the cancelling
 * used to be a statement inside the opt-out and is now a function next door,
 * reached by a dynamic import because `taskAsks` imports this module back.
 * That is exactly the shape of hole that let the connector's tool calls go
 * unlogged for weeks.
 */
describe('switching questions off withdraws what is already on its way', () => {
  it('records the refusal and then withdraws the asks', async () => {
    await optOutFromAsks('171938', 'too many');

    const written = mockQuery.mock.calls.map((call) => String(call[0]));
    expect(written.some((sql) => sql.includes('INSERT INTO ask_optouts'))).toBe(true);
    expect(written.some((sql) => sql.includes('ask_optout_events'))).toBe(true);
    expect(mockWithdraw).toHaveBeenCalledWith('171938');
  });

  /**
   * The order is load-bearing. A person must be left alone from the moment
   * they say so, whatever happens afterwards — so the opt-out row is written
   * before anything reaches a thread.
   */
  it('records the opt-out BEFORE it tries to tell anybody', async () => {
    let optOutWritten = false;
    mockQuery.mockImplementation((sql: string) => {
      if (String(sql).includes('INSERT INTO ask_optouts')) optOutWritten = true;
      return Promise.resolve({ rows: [] } as never);
    });
    mockWithdraw.mockImplementation(() => {
      expect(optOutWritten).toBe(true);
      return Promise.resolve(0);
    });

    await optOutFromAsks('171938');

    expect(mockWithdraw).toHaveBeenCalled();
  });

  /**
   * A person must never fail to be left alone because somebody else's thread
   * could not be written to. The opt-out itself has already happened by then.
   */
  it('does not throw when the withdrawal fails', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockWithdraw.mockRejectedValue(new Error('db down'));

    await expect(optOutFromAsks('171938')).resolves.toBeUndefined();

    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });
});
