jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../pendingUpdates.service', () => ({ __esModule: true, queueResult: jest.fn() }));

import { query } from '../../db/postgres/client';
import { queueResult } from '../pendingUpdates.service';
import { maybeOfferThanksLoop, respondToThanksLoopOffer } from '../thanksLoop.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockQueueResult = queueResult as jest.MockedFunction<typeof queueResult>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQueueResult.mockResolvedValue({ id: 1 });
});

describe('maybeOfferThanksLoop', () => {
  it('only fires on outcome=accepted', async () => {
    expect(await maybeOfferThanksLoop('42', 'sent')).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('does nothing when this is not the FIRST accepted outcome ever', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("outcome = 'accepted'"))
        return Promise.resolve(rows([{ count: '2' }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    expect(await maybeOfferThanksLoop('42', 'accepted')).toBe(false);
  });

  it('does nothing for a user with no inviter', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("outcome = 'accepted'"))
        return Promise.resolve(rows([{ count: '1' }]) as never);
      if (sql.includes('inviterReferralUserId'))
        return Promise.resolve(rows([{ inviterReferralUserId: null }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    expect(await maybeOfferThanksLoop('42', 'accepted')).toBe(false);
  });

  it('offers on the first confirmed result of an invited user', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("outcome = 'accepted'"))
        return Promise.resolve(rows([{ count: '1' }]) as never);
      if (sql.includes('inviterReferralUserId'))
        return Promise.resolve(rows([{ inviterReferralUserId: 7 }]) as never);
      if (sql.includes('INSERT INTO thanks_loop_offers'))
        return Promise.resolve(rows([{ invited_user_id: 42 }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    expect(await maybeOfferThanksLoop('42', 'accepted')).toBe(true);
  });

  it('the primary-key conflict makes a second offer for the same person impossible', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("outcome = 'accepted'"))
        return Promise.resolve(rows([{ count: '1' }]) as never);
      if (sql.includes('inviterReferralUserId'))
        return Promise.resolve(rows([{ inviterReferralUserId: 7 }]) as never);
      if (sql.includes('INSERT INTO thanks_loop_offers')) return Promise.resolve(rows([]) as never); // ON CONFLICT DO NOTHING, already exists
      return Promise.resolve(rows([]) as never);
    });

    expect(await maybeOfferThanksLoop('42', 'accepted')).toBe(false);
  });
});

describe('respondToThanksLoopOffer', () => {
  function routeRespondQueries(opts: {
    offer?: { inviter_user_id: number; state: string } | null;
    capCount?: number;
    inviterName?: string;
  }): void {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT inviter_user_id, state'))
        return Promise.resolve(rows(opts.offer ? [opts.offer] : []) as never);
      if (sql.includes("state = 'consented'"))
        return Promise.resolve(rows([{ count: String(opts.capCount ?? 0) }]) as never);
      if (sql.includes('SELECT name FROM "User"'))
        return Promise.resolve(rows([{ name: opts.inviterName ?? 'გია მაისურაძე' }]) as never);
      return Promise.resolve(rows([]) as never);
    });
  }

  it('reports no offer when none exists for this user', async () => {
    routeRespondQueries({ offer: null });

    expect(await respondToThanksLoopOffer('42', true)).toEqual({
      sent: false,
      error: 'No pending thanks-loop offer for this user.',
    });
    expect(mockQueueResult).not.toHaveBeenCalled();
  });

  it('refuses a second response to an already-resolved offer', async () => {
    routeRespondQueries({ offer: { inviter_user_id: 7, state: 'consented' } });

    expect(await respondToThanksLoopOffer('42', true)).toEqual({
      sent: false,
      error: 'Already responded.',
    });
    expect(mockQueueResult).not.toHaveBeenCalled();
  });

  it('a decline sends nothing and never asks again', async () => {
    routeRespondQueries({ offer: { inviter_user_id: 7, state: 'offered' } });

    const out = await respondToThanksLoopOffer('42', false);

    expect(out).toEqual({ sent: false });
    expect(mockQueueResult).not.toHaveBeenCalled();
    const declineUpdate = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes("'declined'"),
    );
    expect(declineUpdate).toBeDefined();
  });

  it('consent delivers via pendingUpdates, first name only, no search details', async () => {
    routeRespondQueries({
      offer: { inviter_user_id: 7, state: 'offered' },
      inviterName: 'გია მაისურაძე',
    });

    const out = await respondToThanksLoopOffer('42', true);

    expect(out).toEqual({ sent: true });
    expect(mockQueueResult).toHaveBeenCalledWith(
      '7',
      null,
      'thanks_loop',
      expect.objectContaining({ invited_first_name: 'გია' }),
    );
    const payload = mockQueueResult.mock.calls[0][3] as Record<string, unknown>;
    // No search_id, topic, or any field beyond the invited person's first
    // name — the payload structurally cannot carry search details, since
    // none were ever passed in.
    expect(Object.keys(payload).sort()).toEqual(['instruction', 'invited_first_name']);
  });

  it('refuses (silently, as a decline) once the inviter is over their monthly cap', async () => {
    routeRespondQueries({ offer: { inviter_user_id: 7, state: 'offered' }, capCount: 20 });

    const out = await respondToThanksLoopOffer('42', true);

    expect(out).toEqual({ sent: false });
    expect(mockQueueResult).not.toHaveBeenCalled();
  });
});
