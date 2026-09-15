/**
 * Ticket 19 G1 and G5 — two runs on one thread, both replying.
 *
 * Thread 15049, 15 September, taken from run_prompt_stamps rather than from
 * the report:
 *
 *   12:38:18.172  1fc625af   the owner's first message
 *   12:38:31.235  a313be02   an engine wake — the thread read as free
 *   12:38:35.155  3eaa2425   the owner's „კი", started ON TOP of that wake
 *   12:38:36 / :37           both reply, a second apart, with two different
 *                            clarifying questions
 *
 * The guard was one-directional. wakeWhenFree makes a wake wait for the owner;
 * nothing ever stopped the owner from starting a run on top of a wake already
 * running. So the status check only caught the gap BETWEEN the owner's turns —
 * which in a live conversation is precisely where a wake lands.
 *
 * G5 is the same shape one step later: the tap run replies, then the day-one
 * wake replies again, seconds apart, and on thread 15380 the second one acted
 * on a different plan from the first.
 */
jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../chat.service', () => ({ __esModule: true, processChat: jest.fn() }));

import { query } from '../../db/postgres/client';
import { ownerSpokeRecently } from '../taskEngine.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => jest.clearAllMocks());

describe('a thread the owner is still talking in is not free', () => {
  it('reports the owner as recently speaking', async () => {
    mockQuery.mockResolvedValue({ rows: [{ recent: true }], rowCount: 1 } as never);

    expect(await ownerSpokeRecently(15049)).toBe(true);
  });

  it('lets a quiet thread through', async () => {
    mockQuery.mockResolvedValue({ rows: [{ recent: false }], rowCount: 1 } as never);

    expect(await ownerSpokeRecently(15049)).toBe(false);
  });

  it('counts only what the OWNER typed, never an engine event', async () => {
    // Engine events are stored as user rows too. Counting those would make
    // every wake block the next one for ever — the guard would deadlock the
    // very mechanism it protects.
    mockQuery.mockResolvedValue({ rows: [{ recent: false }], rowCount: 1 } as never);

    await ownerSpokeRecently(15049);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql as string).toContain("role = 'user'");
    expect(sql as string).toContain("kind = 'message'");
    expect((params as unknown[])[0]).toBe(15049);
  });

  it('uses a window wide enough to cover the real collision', async () => {
    // On 15049 the wake started 4 seconds before the owner's next message and
    // 13 after the previous one. A window narrower than that gap would have
    // let this exact wake through again.
    mockQuery.mockResolvedValue({ rows: [{ recent: false }], rowCount: 1 } as never);

    await ownerSpokeRecently(15049);

    expect(Number((mockQuery.mock.calls[0][1] as unknown[])[1])).toBeGreaterThanOrEqual(13_000);
  });

  it('treats an unreadable answer as busy, not as free', async () => {
    // Unknown means wait. Talking over the owner is the failure this exists to
    // prevent, so it is the one direction we refuse to risk on a bad read.
    mockQuery.mockRejectedValue(new Error('statement timeout') as never);
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(await ownerSpokeRecently(15049)).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
