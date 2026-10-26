const mockQuery = jest.fn();
const mockHold = jest.fn();
const mockWake = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
  withTransaction: jest.fn(),
  backgroundQuery: jest.fn(),
}));
jest.mock('../heldAsks.service', () => ({
  __esModule: true,
  holdAsk: (...a: unknown[]) => mockHold(...a),
  releaseHeldAsk: jest.fn(),
}));
jest.mock('../taskStore.service', () => ({
  __esModule: true,
  getTaskById: jest.fn(),
  wakeTaskNoLaterThan: (...a: unknown[]) => mockWake(...a),
}));

import { holdFollowUpOverTheLimit } from '../taskAsks.service';

const FIRST_AT = '2026-10-26T10:00:00.000Z';
const input = {
  fromUserId: '1035',
  taskId: 64747,
  toUserId: 3222,
  toName: 'ქეთევან',
  contactPhone: 'p',
  question: 'ხუთშაბათს 15:00-ზე ონლაინ?',
};

beforeEach(() => jest.resetAllMocks());

/** #7824 (c): Davit's third message to Ketevan was refused and the date went a day late. */
describe('a follow-up over the limit is carried, not handed back', () => {
  it('is held until the oldest message turns 24 hours old, and the goal wakes after', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ first_at: FIRST_AT }] });
    mockHold.mockResolvedValueOnce(undefined);
    mockWake.mockResolvedValueOnce(undefined);
    const outcome = (await holdFollowUpOverTheLimit(input)) as {
      reopens_at?: string;
      error?: string;
    };
    expect(outcome.reopens_at).toBe('2026-10-27T10:01:00.000Z');
    expect(mockHold).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 64747, toUserId: 3222, question: input.question }),
    );
    expect((mockWake.mock.calls[0] as [number, Date])[1].toISOString()).toBe(
      '2026-10-27T10:02:00.000Z',
    );
    expect(outcome.error).toContain('სერვერი თავად გააგზავნის');
    expect(outcome.error).toContain('„თავად მიწერე"');
  });

  it('falls back to the plain refusal when it cannot be held', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ first_at: FIRST_AT }] });
    mockHold.mockRejectedValueOnce(new Error('down'));
    const outcome = (await holdFollowUpOverTheLimit(input)) as { reopens_at?: string };
    expect(outcome.reopens_at).toBeUndefined();
    expect(mockWake).not.toHaveBeenCalled();
  });
});
