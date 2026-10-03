jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../taskAsks.service', () => ({ __esModule: true, createAsk: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { createAsk } from '../taskAsks.service';
import { holdAsk, releaseDueHeldAsks, HeldAsk } from '../heldAsks.service';
import { heldAsksSentNote, sendReleasedHeldAsks } from '../heldAskSend.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockCreateAsk = createAsk as jest.MockedFunction<typeof createAsk>;

beforeEach(() => jest.clearAllMocks());

const OWNER = { ownerId: '41', taskId: 11815, threadId: 30100 };
const PLAN_PHONE = 'phone-id-from-plan';

function held(overrides: Partial<HeldAsk> = {}): HeldAsk {
  return {
    id: 1,
    to_user_id: 172756,
    contact_name: 'Netai Test 48',
    contact_phone: PLAN_PHONE,
    question: 'იცნობ კარგ ბუღალტერს?',
    reopens_at: '2026-10-02T09:16:00.000Z',
    ...overrides,
  };
}

/**
 * The tester's 983: an approved plan's question was refused by the
 * recipient's 24-hour limit; at the wake the run guessed („ალბათ") whether it
 * had reopened and asked the owner for a second yes. Board #391: the question
 * is held, and at the reopening the server sends it itself.
 */
describe('a question held by the recipient’s limit', () => {
  it('is recorded once per goal and person, with the plan’s phone id and its reopening', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as never);
    const at = new Date('2026-10-02T09:16:00Z');
    await holdAsk({
      taskId: 11815,
      toUserId: 172756,
      contactName: 'Netai Test 48',
      contactPhone: PLAN_PHONE,
      question: 'იცნობ კარგ ბუღალტერს?',
      reopensAt: at,
    });
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('WHERE NOT EXISTS');
    expect(params).toEqual([
      11815,
      172756,
      'Netai Test 48',
      PLAN_PHONE,
      'იცნობ კარგ ბუღალტერს?',
      at,
    ]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('is released only once its window has reopened, and only once', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ ...held(), reopens_at: '2026-10-02T09:16:00Z' }],
      rowCount: 1,
    } as never);
    const released = await releaseDueHeldAsks(11815);
    expect(released[0]).toEqual(held());
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain('reopens_at <= NOW()');
    expect(sql).toContain('released_at IS NULL');
    expect(sql).toContain('SET released_at = NOW()');
  });
});

describe('board #391: the server sends it when the window reopens', () => {
  it('goes out once, to the phone id the plan named, through createAsk', async () => {
    mockCreateAsk.mockResolvedValue({ sent: true, ask_id: 9, to_name: 'Netai Test 48' });
    const outcomes = await sendReleasedHeldAsks(OWNER, [held()]);
    expect(mockCreateAsk).toHaveBeenCalledTimes(1);
    expect(mockCreateAsk).toHaveBeenCalledWith(
      '41',
      11815,
      PLAN_PHONE,
      'იცნობ კარგ ბუღალტერს?',
      undefined,
      30100,
    );
    expect(outcomes).toEqual([
      { contact_name: 'Netai Test 48', question: 'იცნობ კარგ ბუღალტერს?', sent: true },
    ]);
  });

  it('falls back to the person’s own number on a row held before the phone id was kept', async () => {
    mockQuery.mockResolvedValue({ rows: [{ phone: 'own-number' }], rowCount: 1 } as never);
    mockCreateAsk.mockResolvedValue({ sent: true, ask_id: 9, to_name: 'Netai Test 48' });
    await sendReleasedHeldAsks(OWNER, [held({ contact_phone: null })]);
    expect(mockQuery.mock.calls[0][1]).toEqual([172756]);
    expect(mockCreateAsk.mock.calls[0][2]).toBe('own-number');
  });

  it('reports a refusal and goes on to the next question', async () => {
    mockCreateAsk
      .mockResolvedValueOnce({ sent: false, error: 'x', reason: 'recipient_opted_out' })
      .mockResolvedValueOnce({ sent: true, ask_id: 10, to_name: 'B' });
    const outcomes = await sendReleasedHeldAsks(OWNER, [
      held(),
      held({ id: 2, contact_name: 'B', question: 'q2' }),
    ]);
    expect(outcomes.map((o) => o.sent)).toEqual([false, true]);
    expect(outcomes[0].reason).toBe('recipient_opted_out');
  });

  it('keeps going when one send throws', async () => {
    mockCreateAsk
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({ sent: true, ask_id: 10, to_name: 'B' });
    const outcomes = await sendReleasedHeldAsks(OWNER, [
      held(),
      held({ id: 2, contact_name: 'B', question: 'q2' }),
    ]);
    expect(outcomes.map((o) => o.reason ?? 'sent')).toEqual(['error', 'sent']);
  });

  it('tells the run it went: do not send again, never ask the owner, never a phone id', () => {
    const note = heldAsksSentNote([
      { contact_name: 'Netai Test 48', question: 'იცნობ კარგ ბუღალტერს?', sent: true },
    ]);
    expect(note).toContain('• Netai Test 48: „იცნობ კარგ ბუღალტერს?"');
    expect(note).toContain('სერვერმა ეს დაკავებული კითხვები უკვე გააგზავნა');
    expect(note).toContain('ხელახლა არ გაგზავნო');
    expect(note).toContain('მფლობელს არაფერს ეკითხები');
    expect(note).toContain('D119');
    expect(note).not.toContain(PLAN_PHONE);
  });

  it('names what did not go, without guessing', () => {
    const note = heldAsksSentNote([
      { contact_name: 'B', question: 'q', sent: false, reason: 'recipient_opted_out' },
    ]);
    expect(note).toContain('• B — recipient_opted_out');
    expect(note).toContain('„ალბათ"-ზე არ ილაპარაკო');
    expect(note).not.toContain('უკვე გააგზავნა');
  });
});

describe('where it is wired', () => {
  const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
  const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');

  it('holds the question where the limit refuses it, and releases it when it goes', () => {
    expect(asks).toContain('await holdAsk({');
    expect(asks).toContain('        contactPhone,\n        question: trimmed,');
    expect(asks).toContain('void releaseHeldAsk(taskId, toUserId)');
  });

  it('sends the held questions at the scheduled wake and tells the run', () => {
    expect(engine).toContain('await wakeTask(task.id, await scheduledWakeText(task.id));');
    expect(engine).toContain('const held = await releaseDueHeldAsks(taskId);');
    expect(engine).toContain('return heldAsksSentNote(await sendReleasedHeldAsks(owner, held));');
  });
});
