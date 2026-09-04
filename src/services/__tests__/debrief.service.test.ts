jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../pendingUpdates.service', () => ({
  __esModule: true,
  queueFollowUp: jest.fn().mockResolvedValue({ id: 1 }),
}));

import { query } from '../../db/postgres/client';
import { queueFollowUp, PendingUpdate } from '../pendingUpdates.service';
import {
  armIntroDebrief,
  armAskDebrief,
  armSearchDebrief,
  filterStaleDebriefs,
  recordDebriefOutcome,
} from '../debrief.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockQueueFollowUp = queueFollowUp as jest.MockedFunction<typeof queueFollowUp>;

function rows(data: unknown[], rowCount = data.length): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount };
}

beforeEach(() => jest.clearAllMocks());

describe('arming — D49: 3 days, once per introduction', () => {
  it('an accepted introduction queues ONE debrief item for the requester, 3 days out', async () => {
    mockQuery.mockResolvedValue(rows([{ ref_id: 5 }]) as never);

    await armIntroDebrief('9', 5, 'გიორგი');

    const [armSql, armParams] = mockQuery.mock.calls[0];
    expect(armSql as string).toContain('INSERT INTO debrief_arms');
    expect(armSql as string).toContain('ON CONFLICT (kind, ref_id) DO NOTHING');
    expect(armParams).toEqual(['intro_request', 5, '9']);
    expect(mockQueueFollowUp).toHaveBeenCalledWith(
      '9',
      null,
      'debrief',
      expect.objectContaining({
        about: 'introduction',
        intro_request_id: 5,
        who: 'გიორგი',
        technique_tag: null,
        why: expect.any(String),
        instruction: expect.any(String),
      }),
      3,
    );
  });

  it('a SECOND arm of the same introduction queues nothing — the primary key is the guard', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await armIntroDebrief('9', 5, 'გიორგი');

    expect(mockQueueFollowUp).not.toHaveBeenCalled();
  });

  it("a relayed ask arms the ASKER's debrief carrying the ask and its goal", async () => {
    mockQuery.mockResolvedValue(rows([{ ref_id: 12 }]) as never);

    await armAskDebrief('42', 12, 3, 'გია');

    expect(mockQueueFollowUp).toHaveBeenCalledWith(
      '42',
      3,
      'debrief',
      expect.objectContaining({ about: 'relayed_ask', ask_id: 12, who: 'გია' }),
      3,
    );
  });

  it('a follow-up supersedes the previous chase — one conversation, one item (ticket 9 task 12)', async () => {
    mockQuery.mockResolvedValue(rows([{ ref_id: 13 }]) as never);

    await armAskDebrief('42', 13, 3, 'გია', true);

    const drop = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('DELETE FROM pending_updates'),
    ) as [string, unknown[]];
    expect(drop[0]).toContain("payload->>'about' = 'relayed_ask'");
    expect(drop[1]).toEqual(['42', 3, 'debrief']);
    // The new round still gets its own chase.
    expect(mockQueueFollowUp).toHaveBeenCalledWith(
      '42',
      3,
      'debrief',
      expect.objectContaining({ ask_id: 13 }),
      3,
    );
  });

  it('a FIRST ask deletes nothing — there is no earlier round to supersede', async () => {
    mockQuery.mockResolvedValue(rows([{ ref_id: 12 }]) as never);

    await armAskDebrief('42', 12, 3, 'გია');

    expect(
      mockQuery.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM pending_updates')),
    ).toBe(false);
  });

  it("an accepted search arms a debrief naming the search's own topic", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO debrief_arms'))
        return Promise.resolve(rows([{ ref_id: 77 }]) as never);
      if (sql.includes('FROM search_activity'))
        return Promise.resolve(rows([{ query: 'სანტექნიკოსი' }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    await armSearchDebrief('501', 77);

    const [, , kind, payload] = mockQueueFollowUp.mock.calls[0];
    expect(kind).toBe('debrief');
    expect(payload).toEqual(expect.objectContaining({ about: 'search', search_id: 77 }));
    expect(String((payload as Record<string, unknown>)['why'])).toContain('სანტექნიკოსი');
  });
});

describe("filterStaleDebriefs — D49's 'with no outcome recorded', applied at release", () => {
  const item = (payload: Record<string, unknown>, kind = 'debrief'): PendingUpdate => ({
    id: 1,
    task_id: null,
    kind,
    payload,
  });

  it('keeps non-debrief items untouched and never queries for them', async () => {
    const updates = [
      item({ summary: 'x' }, 'thanks_loop'),
      item({ search_id: 9 }, 'search_followup'),
    ];

    expect(await filterStaleDebriefs('501', updates)).toEqual(updates);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('drops an ask debrief once the ask was answered — the outcome arrived by itself', async () => {
    mockQuery.mockResolvedValue(rows([{ status: 'answered' }]) as never);

    const out = await filterStaleDebriefs('42', [item({ about: 'relayed_ask', ask_id: 12 })]);

    expect(out).toEqual([]);
  });

  it('keeps an ask debrief while the ask is still just sent', async () => {
    mockQuery.mockResolvedValue(rows([{ status: 'sent' }]) as never);

    const updates = [item({ about: 'relayed_ask', ask_id: 12 })];
    expect(await filterStaleDebriefs('42', updates)).toEqual(updates);
  });

  it('KEEPS a search debrief whose ladder moved past accepted but worked is unanswered', async () => {
    // A rung advance is progress, not an answer — live-caught 30 Aug: the
    // model advanced accepted → followed_up while the user was ANSWERING the
    // debrief, and the question silently died with the success lost.
    mockQuery.mockResolvedValue(rows([{ outcome: 'replied', outcome_worked: null }]) as never);

    const updates = [item({ about: 'search', search_id: 77 })];
    expect(await filterStaleDebriefs('501', updates)).toEqual(updates);
  });

  it('drops a search debrief once worked is recorded, or the search regressed to refused', async () => {
    mockQuery.mockResolvedValue(rows([{ outcome: 'followed_up', outcome_worked: true }]) as never);
    expect(await filterStaleDebriefs('501', [item({ about: 'search', search_id: 77 })])).toEqual(
      [],
    );

    mockQuery.mockResolvedValue(rows([{ outcome: 'refused', outcome_worked: null }]) as never);
    expect(await filterStaleDebriefs('501', [item({ about: 'search', search_id: 78 })])).toEqual(
      [],
    );
  });

  it('keeps a search debrief still sitting on accepted with no worked answer', async () => {
    mockQuery.mockResolvedValue(rows([{ outcome: 'accepted', outcome_worked: null }]) as never);

    const updates = [item({ about: 'search', search_id: 77 })];
    expect(await filterStaleDebriefs('501', updates)).toEqual(updates);
  });

  it('drops an intro debrief whose rung was already recorded', async () => {
    mockQuery.mockResolvedValue(rows([{ id: 3 }]) as never);

    expect(
      await filterStaleDebriefs('9', [item({ about: 'introduction', intro_request_id: 5 })]),
    ).toEqual([]);
  });

  it('a failed check KEEPS the item — asking once too often beats losing the question', async () => {
    mockQuery.mockRejectedValue(new Error('db down'));

    const updates = [item({ about: 'search', search_id: 77 })];
    expect(await filterStaleDebriefs('501', updates)).toEqual(updates);
  });
});

describe('recordDebriefOutcome — the answer becomes a rung', () => {
  it("writes 'worked' scoped to the caller's own introduction", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM introduction_requests'))
        return Promise.resolve(rows([{ id: 5 }]) as never);
      if (sql.includes("IN ('worked', 'did_not_work')")) return Promise.resolve(rows([]) as never);
      return Promise.resolve(rows([], 1) as never);
    });

    const out = await recordDebriefOutcome('9', 'introduction', 5, true);

    expect(out).toEqual({ recorded: true });
    const insert = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO outcome_events'),
    );
    expect(insert?.[1]).toEqual(['9', 'intro_request', '5', 'worked']);
  });

  it("refuses a ref_id that is not the caller's own — never trusted bare", async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    const out = await recordDebriefOutcome('999', 'relayed_ask', 12, false);

    expect(out.recorded).toBe(false);
    const insert = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO outcome_events'),
    );
    expect(insert).toBeUndefined();
  });

  it('is idempotent: a rung already standing reports already=true and writes nothing new', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM task_asks')) return Promise.resolve(rows([{ id: 12 }]) as never);
      if (sql.includes("IN ('worked', 'did_not_work')"))
        return Promise.resolve(rows([{ id: 8 }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    const out = await recordDebriefOutcome('42', 'relayed_ask', 12, true);

    expect(out).toEqual({ recorded: true, already: true });
    const insert = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO outcome_events'),
    );
    expect(insert).toBeUndefined();
  });

  it('rejects a nonsense ref_id before touching the database', async () => {
    const out = await recordDebriefOutcome('42', 'relayed_ask', Number.NaN, true);

    expect(out.recorded).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('not_yet — the ONE re-ask (approved 29 Aug)', () => {
  it('re-queues the question once, 3 days out, and spends the one-shot guard', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM introduction_requests') && sql.includes('requester_user_id'))
        return Promise.resolve(rows([{ id: 5 }]) as never);
      if (sql.includes('UPDATE debrief_arms SET rearmed_at'))
        return Promise.resolve(rows([{ ref_id: 5 }]) as never);
      if (sql.includes('SELECT target_name'))
        return Promise.resolve(rows([{ target_name: 'გიორგი' }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    const out = await recordDebriefOutcome('9', 'introduction', 5, false, true);

    expect(out.recorded).toBe(true);
    expect(out.rearmed).toBe(true);
    expect(mockQueueFollowUp).toHaveBeenCalledWith(
      '9',
      null,
      'debrief',
      expect.objectContaining({ about: 'introduction', intro_request_id: 5, who: 'გიორგი' }),
      3,
    );
    // A not_yet never writes a rung.
    const insert = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO outcome_events'),
    );
    expect(insert).toBeUndefined();
  });

  it('a SECOND not_yet re-queues nothing — rearmed_at is the one-shot guard', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM introduction_requests') && sql.includes('requester_user_id'))
        return Promise.resolve(rows([{ id: 5 }]) as never);
      if (sql.includes('UPDATE debrief_arms SET rearmed_at'))
        return Promise.resolve(rows([]) as never); // already spent
      return Promise.resolve(rows([]) as never);
    });

    const out = await recordDebriefOutcome('9', 'introduction', 5, false, true);

    expect(out.recorded).toBe(true);
    expect(out.rearmed).toBe(false);
    expect(mockQueueFollowUp).not.toHaveBeenCalled();
  });

  it('subject "search" is accepted ONLY with not_yet — a worked write is refused toward record_search_outcome', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM search_activity') && sql.includes('user_id'))
        return Promise.resolve(rows([{ id: 77 }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    const refused = await recordDebriefOutcome('501', 'search', 77, true, false);
    expect(refused.recorded).toBe(false);
    expect(String(refused.error)).toContain('record_search_outcome');
  });
});
