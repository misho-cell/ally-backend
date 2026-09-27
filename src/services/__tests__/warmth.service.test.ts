jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../pendingUpdates.service', () => ({
  __esModule: true,
  queueFollowUp: jest.fn().mockResolvedValue({ id: 1 }),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { queueFollowUp } from '../pendingUpdates.service';
import {
  recordWarmth,
  recordMutualWarmth,
  warmthForPhones,
  warmthByPhoneAndUser,
  queueWarmTieQuestions,
  MAX_WARMTH_FROM_EVENTS,
  WARM_TIE_KIND,
} from '../warmth.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockQueue = queueFollowUp as jest.MockedFunction<typeof queueFollowUp>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue(rows([]) as never);
});

describe('recordWarmth — the ledger of what actually happened', () => {
  it('writes the kind and its weight, and never twice in one day', async () => {
    await recordWarmth('501', '+995599111111', 'ask_answered', 'ask_1255');

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO warmth_events');
    expect(sql).toContain('ON CONFLICT DO NOTHING');
    expect(params).toEqual(['501', '+995599111111', 'ask_answered', 0.2, 'ask_1255']);
  });

  it('weighs what the user SAID above what the system inferred', async () => {
    await recordWarmth('501', '+995599111111', 'stated_close');
    await recordWarmth('501', '+995599111111', 'intro_accepted');
    await recordWarmth('501', '+995599111111', 'ask_answered');

    const weights = mockQuery.mock.calls.map(([, params]) => (params as unknown[])[3]);
    expect(weights).toEqual([0.5, 0.3, 0.2]);
  });

  it('refuses a phone that is not a phone rather than writing a junk row', async () => {
    expect(await recordWarmth('501', 'not a number', 'stated_close')).toBe(false);

    expect(mockQuery).not.toHaveBeenCalled();
  });

  /**
   * AND IT SAYS SO. The refusal above was already here and already right; what
   * was missing is that nobody could hear it. `Promise<void>` left both doors
   * — `save_close_contact` in chat and in the connector — answering
   * `saved: true` over a write that never happened.
   */
  it('answers that it wrote when it wrote', async () => {
    expect(await recordWarmth('501', '+995599111111', 'stated_close')).toBe(true);
  });

  /**
   * AND IT STORES THE CANONICAL NUMBER. Every read is an exact
   * `contact_phone = ANY(...)` against phones taken from the tables — a row
   * stored the way a person types it would sit there matching nothing. All 113
   * rows in the live table are `+digits`; this is the one writer whose phone
   * comes from a model rather than a table.
   */
  it('stores the canonical number, not what was typed', async () => {
    await recordWarmth('501', '599 11 11 11', 'stated_close');

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[1]).toBe('+995599111111');
  });
});

/**
 * THE TWO DOORS. A service that refuses perfectly changes nothing if the door
 * discards the answer — which is exactly what both of these did. Neither is
 * callable in isolation (one is a `switch` arm inside a long closure, the
 * other resolves a contact_ref first), so they are held on the source, whole
 * lines rather than fragments.
 */
describe('save_close_contact reports what the ledger actually did', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const connector = readFileSync(join(__dirname, '..', 'mcp', 'handlers.ts'), 'utf8');

  it('the chat door returns the service’s answer', () => {
    expect(chat).toContain(
      "if (!recorded) return { saved: false, error: 'Pass the contact phone from a search result.' };",
    );
  });

  it('the connector door returns the service’s answer', () => {
    expect(connector).toContain(
      "const recorded = await recordWarmth(userId, phone, 'stated_close', 'connector');\n" +
        '  if (!recorded) return { saved: false, error: UNKNOWN_REF_ERROR };',
    );
  });
});

describe('recordMutualWarmth — an exchange is evidence about the PAIR', () => {
  it('records both directions from the two accounts’ own numbers', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM "UserPhone"'))
        return Promise.resolve(
          rows([
            { user_id: 170748, phone: '+995555000003' },
            { user_id: 170749, phone: '+995555000004' },
          ]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });

    await recordMutualWarmth('170748', '170749', 'ask_answered', 'ask_1255');

    const inserts = mockQuery.mock.calls
      .filter(([sql]) => String(sql).includes('INSERT INTO warmth_events'))
      .map(([, params]) => (params as unknown[]).slice(0, 3));
    expect(inserts).toEqual([
      ['170748', '+995555000004', 'ask_answered'],
      ['170749', '+995555000003', 'ask_answered'],
    ]);
  });

  it('records the side it can when only one account has a number on file', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM "UserPhone"'))
        return Promise.resolve(rows([{ user_id: 170749, phone: '+995555000004' }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    await recordMutualWarmth('170748', '170749', 'intro_accepted');

    const inserts = mockQuery.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO warmth_events'),
    );
    expect(inserts).toHaveLength(1);
  });
});

describe('reading warmth back', () => {
  it('caps a single pair — a ledger is not a popularity contest', async () => {
    mockQuery.mockResolvedValue(
      rows([
        { contact_phone: '+995599111111', total: '2.4', events: '9', kinds: ['ask_answered'] },
      ]) as never,
    );

    const out = await warmthForPhones('501', ['+995599111111']);

    expect(out.get('+995599111111')?.score).toBe(MAX_WARMTH_FROM_EVENTS);
    expect(out.get('+995599111111')?.events).toBe(9);
  });

  it('reads inside the window only — warmth decays out of it', async () => {
    await warmthForPhones('501', ['+995599111111']);

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("($3 || ' days')::INTERVAL");
  });

  it('groups by phone and user for the inviter search', async () => {
    mockQuery.mockResolvedValue(
      rows([
        { contact_phone: '+995599111111', user_id: 501, total: '0.5' },
        { contact_phone: '+995599111111', user_id: 170748, total: '0.2' },
      ]) as never,
    );

    const out = await warmthByPhoneAndUser(['+995599111111']);

    expect(out.get('+995599111111')?.get(501)).toBe(0.5);
    expect(out.get('+995599111111')?.get(170748)).toBe(0.2);
  });

  it('asks nothing at all for an empty phone list', async () => {
    expect((await warmthByPhoneAndUser([])).size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('queueWarmTieQuestions — source 2 reaches the user through the one list', () => {
  it('asks only users whose warm pool is thin and who were not asked recently', async () => {
    mockQuery.mockResolvedValue(rows([{ user_id: 501 }]) as never);

    const queued = await queueWarmTieQuestions(25);

    expect(queued).toBe(1);
    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FROM warmth_events w');
    expect(sql).toContain('FROM pending_updates p');
    expect(sql).toContain("u.subscription_status = 'active'");
  });

  it('queues an instruction that says how to ask and when to drop it', async () => {
    mockQuery.mockResolvedValue(rows([{ user_id: 501 }]) as never);

    await queueWarmTieQuestions(25);

    const [userId, taskId, kind, payload] = mockQueue.mock.calls[0];
    expect(userId).toBe('501');
    expect(taskId).toBeNull();
    expect(kind).toBe(WARM_TIE_KIND);
    const instruction = String((payload as Record<string, unknown>)['instruction']);
    expect(instruction).toContain('save_close_contact');
    expect(instruction).toContain('never as the opening line');
    expect(instruction).toContain('drop it at once');
  });

  it('queues nothing when every pool is healthy', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    expect(await queueWarmTieQuestions(25)).toBe(0);
    expect(mockQueue).not.toHaveBeenCalled();
  });
});
