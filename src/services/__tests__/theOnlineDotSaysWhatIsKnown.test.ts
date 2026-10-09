import { query } from '../../db/postgres/client';
import {
  AssistantState,
  assistantStateFrom,
  assistantStatus,
  FRESH_EVIDENCE_MS,
} from '../assistantStatus.service';

jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
const mockQuery = query as jest.MockedFunction<typeof query>;

const NOW = new Date('2026-10-09T19:40:00Z');
const minutesAgo = (m: number): Date => new Date(NOW.getTime() - m * 60_000);

/** D699: green only while the assistant answers, red while it does not, nothing while unknown. */
describe('the assistant status', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is answering when the provider answered recently', () => {
    expect(assistantStateFrom({ lastAnswer: minutesAgo(3), refusingSince: null }, NOW)).toEqual({
      state: AssistantState.Answering,
      since: null,
      checked_at: minutesAgo(3).toISOString(),
    });
  });

  it('is not answering while a refusal is open and nothing answered after it', () => {
    expect(
      assistantStateFrom({ lastAnswer: minutesAgo(50), refusingSince: minutesAgo(40) }, NOW),
    ).toEqual({
      state: AssistantState.NotAnswering,
      since: minutesAgo(40).toISOString(),
      checked_at: minutesAgo(40).toISOString(),
    });
  });

  it('is answering again once an answer came after the refusal began', () => {
    expect(
      assistantStateFrom({ lastAnswer: minutesAgo(1), refusingSince: minutesAgo(40) }, NOW).state,
    ).toBe(AssistantState.Answering);
  });

  it('is unknown when the newest answer is too old to prove anything', () => {
    const old = new Date(NOW.getTime() - FRESH_EVIDENCE_MS - 60_000);
    expect(assistantStateFrom({ lastAnswer: old, refusingSince: null }, NOW)).toEqual({
      state: AssistantState.Unknown,
      since: null,
      checked_at: old.toISOString(),
    });
  });

  it('is unknown with no evidence at all', () => {
    expect(assistantStateFrom({ lastAnswer: null, refusingSince: null }, NOW)).toEqual({
      state: AssistantState.Unknown,
      since: null,
      checked_at: null,
    });
  });

  it('reads both facts in one bounded query', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ last_answer: minutesAgo(2), refusing_since: null }],
    } as never);
    await expect(assistantStatus(NOW)).resolves.toMatchObject({
      state: AssistantState.Answering,
    });
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("provider = 'anthropic'");
    expect(String(sql)).toContain('cleared_at IS NULL');
    expect(params).toEqual(['provider_refusing']);
    expect(timeout).toBeGreaterThan(0);
  });
});
